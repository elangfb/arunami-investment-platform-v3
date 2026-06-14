import { getSLAStatus, slaState } from '@/lib/sla-utils'
import { meetingMomSlaState } from '@/lib/komite'
import { APPROVAL_ROLE_LABEL } from '@/lib/approval-desks'
import type { ApprovalChain, ApprovalRole } from '@/lib/approval-chain'
import type { KomiteMeeting, LoanApplication } from '@/lib/types'
import type { HolidayCalendar } from '@/lib/scheduling/holidays'

// Severity maps onto the semantic status tones (danger/warning/info) — the
// notification's triage axis. overdue → danger; at_risk / unconfirmed OCR /
// awaiting-your-signature → warning; missing required docs → info.
export type NotificationSeverity = 'danger' | 'warning' | 'info'

export type NotificationCategory = 'sla' | 'ocr' | 'docs' | 'mom' | 'mention' | 'approval' | 'colek' | 'review'

export interface NotificationItem {
  id: string
  title: string
  description: string
  severity: NotificationSeverity
  category: NotificationCategory
  /** The application this alert is about. */
  appId: string
  nasabahName: string
  /** When the underlying state was last touched — drives the relative timestamp. */
  timestamp: Date
  /** Deep-link into the application (role-agnostic landing on Ringkasan). */
  href: string
  /** Primary CTA label. */
  cta: string
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = { danger: 0, warning: 1, info: 2 }

/** Triage order: by severity (danger first), then newest first. */
export function sortNotifications(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.timestamp.getTime() - a.timestamp.getTime(),
  )
}

/**
 * Derives the actionable notifications for a set of applications. Single source
 * of truth for both the /notifications page and the sidebar unread badge so they
 * never disagree. (Computed on the fly from app state — there is no separate feed.)
 */
export function buildNotifications(apps: LoanApplication[]): NotificationItem[] {
  return apps.flatMap((app) => {
    // Terminal apps (disbursed/Cair or committee-rejected) are closed — their
    // SLA clock is stopped and nothing about them is actionable, so they raise
    // no alerts (avoids the alarm-fatigue of "SLA terlewati" on done deals).
    if (slaState(app).status === 'done') return []

    const items: NotificationItem[] = []
    const slaStatus = getSLAStatus(app.stage, app.enteredStageAt, app.slaTargetDays)
    const base = { appId: app.id, nasabahName: app.nasabahName, timestamp: app.enteredStageAt, href: `/applications/${app.id}?view=ringkasan`, cta: 'Buka aplikasi' }

    if (slaStatus === 'overdue' || slaStatus === 'at_risk') {
      items.push({
        ...base,
        id: `${app.id}-sla`,
        title: slaStatus === 'overdue' ? 'SLA terlewati' : 'SLA berisiko',
        description: `${app.nasabahName} membutuhkan perhatian SLA pada tahap ini.`,
        severity: slaStatus === 'overdue' ? 'danger' : 'warning',
        category: 'sla',
      })
    }

    if (Object.values(app.extractionSources ?? {}).some((value) => value === 'ocr_suggested')) {
      items.push({
        ...base,
        id: `${app.id}-ocr`,
        title: 'Nilai OCR belum dikonfirmasi',
        description: `${app.nasabahName} memiliki data hasil OCR yang perlu ditinjau.`,
        severity: 'warning',
        category: 'ocr',
        cta: 'Tinjau data',
      })
    }

    if (app.documents.some((doc) => doc.required && doc.status === 'missing')) {
      items.push({
        ...base,
        id: `${app.id}-docs`,
        title: 'Dokumen wajib belum lengkap',
        description: `${app.nasabahName} masih memiliki dokumen wajib yang belum diunggah.`,
        severity: 'info',
        category: 'docs',
        cta: 'Lengkapi dokumen',
      })
    }

    return items
  })
}

/**
 * Meeting-level notifications: a completed committee session whose minutes (MOM) are due or
 * overdue (≤ H+1 business day, lib/komite.meetingMomSlaState). Kept separate from the per-app
 * builder because it's keyed on meetings, not applications; callers merge the two lists.
 */
export function buildMeetingNotifications(meetings: KomiteMeeting[], holidays?: HolidayCalendar): NotificationItem[] {
  return meetings.flatMap((m) => {
    const mom = meetingMomSlaState(m, new Date(), holidays)
    if (!mom || (mom.status !== 'overdue' && mom.status !== 'at_risk')) return []
    return [{
      id: `${m.id}-mom`,
      title: mom.status === 'overdue' ? 'Notulen komite terlambat' : 'Notulen komite jatuh tempo',
      description: `Sidang ${m.id} (${m.date}) — ${mom.label}.`,
      severity: mom.status === 'overdue' ? 'danger' : 'warning',
      category: 'mom',
      appId: m.id,
      nasabahName: `Sidang ${m.id}`,
      timestamp: m.scheduledDate ?? new Date(`${m.date}T${m.time || '00:00'}:00+07:00`),
      href: '/komite',
      cta: 'Catat notulen',
    }]
  })
}

/**
 * A discussion @mention awaiting the actor's attention (source for buildMentionNotifications).
 * Resolved server-side from ConversationMessage rows (listUnansweredMentions) — one per app, the
 * most recent unanswered mention.
 */
export interface MentionNotice {
  appId: string
  nasabahName: string
  byName: string
  preview: string
  at: Date
}

/**
 * @mention notifications (MentionUser): a discussion message that @mentions the actor and is still
 * unanswered (they have not posted since). ACTOR-SPECIFIC — unlike the actor-agnostic builders above,
 * so the page/badge resolve the notices for the signed-in actor. Derived from the message rows
 * (no separate store); self-resolves once the actor replies.
 */
export function buildMentionNotifications(notices: MentionNotice[]): NotificationItem[] {
  return notices.map((n) => ({
    id: `${n.appId}-mention`,
    title: 'Anda disebut dalam diskusi',
    description: `${n.byName} menyebut Anda: "${n.preview}"`,
    severity: 'info',
    category: 'mention',
    appId: n.appId,
    nasabahName: n.nasabahName,
    timestamp: n.at,
    href: `/applications/${n.appId}?view=discussion`,
    cta: 'Buka diskusi',
  }))
}

/**
 * An approval rung awaiting the actor's signature (source for buildApprovalNotifications). Resolved
 * server-side from the ladder state + per-submitter routing (lib/approval-notify.awaitingApprovalNotices)
 * — ACTOR-SPECIFIC like mentions: the checker signers (TL, RTL) are NOT stage owners so the
 * app is otherwise invisible on their Home; this is the push (approval-routing-config.md gap #2).
 */
export interface ApprovalNotice {
  appId: string
  nasabahName: string
  chain: ApprovalChain
  role: ApprovalRole
  at: Date
}

const APPROVAL_CHAIN_LABEL: Record<ApprovalChain, string> = { muap: 'MUAP', rsk: 'RSK', sp3: 'SP3' }

/** Approval-signature notifications: a MUAP/RSK ladder rung awaiting THIS actor's signature. */
export function buildApprovalNotifications(notices: ApprovalNotice[]): NotificationItem[] {
  return notices.map((n) => ({
    id: `${n.appId}-approval-${n.chain}`,
    title: 'Menunggu tanda tangan Anda',
    description: `${APPROVAL_CHAIN_LABEL[n.chain]} ${n.nasabahName} menunggu persetujuan Anda (${APPROVAL_ROLE_LABEL[n.role]}).`,
    severity: 'warning',
    category: 'approval',
    appId: n.appId,
    nasabahName: n.nasabahName,
    timestamp: n.at,
    // MUAP/RSK have their own detail tab; the SP3 ladder lives on the Pencairan tab (its review surface
    // sits beside the disbursement gate it unblocks — there is no standalone 'sp3' DetailView).
    href: `/applications/${n.appId}?view=${n.chain === 'sp3' ? 'pencairan' : n.chain}`,
    cta: 'Tinjau & tanda tangani',
  }))
}

/**
 * A pending COLEK (cross-desk work request) assigned to the actor (source for buildColekNotifications).
 * Resolved server-side from listPendingColeksForUser(actor) joined to the app's nasabahName (ColekRow
 * carries no nasabahName, so the server enriches it — mirrors MentionNotice/ApprovalNotice). ACTOR-
 * SPECIFIC: a colek is directed at one assignee, so the page/badge resolve it for the signed-in actor.
 * Derived (no Notify store): self-resolves once the colek leaves pending/in_progress (done/rejected).
 */
export interface ColekNotice {
  colekId: string
  appId: string
  nasabahName: string
  targetDesk: string
  requestedByName: string
  description: string
  at: Date
}

/**
 * @colek notifications (DeskAssignment): a cross-desk work request directed AT the actor and still
 * open (pending/in_progress). ACTOR-SPECIFIC like mentions/approvals — the assignee is often not a
 * stage owner of the app, so it would otherwise be invisible on their Home; this is the push. One
 * info item per open colek. Derived from the colek rows (no separate store); self-resolves on
 * complete/reject.
 */
export function buildColekNotifications(notices: ColekNotice[]): NotificationItem[] {
  return notices.map((n) => ({
    id: `${n.colekId}-colek`,
    title: `Colek: pekerjaan ${n.targetDesk} diminta`,
    description: `${n.requestedByName} meminta: "${n.description}"`,
    severity: 'info',
    category: 'colek',
    appId: n.appId,
    nasabahName: n.nasabahName,
    timestamp: n.at,
    href: `/applications/${n.appId}?view=ringkasan`,
    cta: 'Buka',
  }))
}

/**
 * A facility whose scheduled review is DUE or SOON (source for buildReviewDueNotifications). Resolved
 * server-side (server/notifications/review-due-notices.ts) by anchoring on app.disbursedAt + the
 * Customer's cadence — reviewDueState (lib/review-cadence.ts), which reads ONLY dates (INVARIANT
 * "Mizan records, never monitors"). One per due/soon facility; 'ok'/'n-a' apps raise none.
 */
export interface ReviewDueNotice {
  appId: string
  nasabahName: string
  /** 'due' (now ≥ dueDate) or 'soon' (within ~30 days) — 'ok'/'n/a' are filtered out by the resolver. */
  status: 'due' | 'soon'
  /** The computed cadence due-date (addMonths(disbursedAt, cadence)) — drives the timestamp + copy. */
  dueDate: Date
}

/**
 * Review-cadence notifications (RM-led redesign §7 / Topic 7): a Bank-initiated periodic review is DUE
 * or approaching on a disbursed facility. Mirrors buildColekNotifications. WARNING severity (shape-coded
 * triangle in the UI — WCAG 1.4.1, never colour-only); CTA "Mulai review"; deep-links to the app so the
 * RM can start the review (startReviewAction). Actor-agnostic like the SLA/docs builders — every RM who
 * can act on the facility should see the cadence flag (the page filters by canActOnDesk).
 */
export function buildReviewDueNotifications(notices: ReviewDueNotice[]): NotificationItem[] {
  return notices.map((n) => ({
    id: `${n.appId}-review`,
    title: n.status === 'due' ? 'Review terjadwal jatuh tempo' : 'Review terjadwal mendekati',
    description:
      n.status === 'due'
        ? `Review berkala ${n.nasabahName} sudah jatuh tempo — mulai siklus review.`
        : `Review berkala ${n.nasabahName} akan jatuh tempo dalam ~30 hari.`,
    severity: 'warning',
    category: 'review',
    appId: n.appId,
    nasabahName: n.nasabahName,
    timestamp: n.dueDate,
    href: `/applications/${n.appId}?view=ringkasan`,
    cta: 'Mulai review',
  }))
}

/** Unread badge count: per-app alerts + (optional) meeting MOM alerts + @mentions + approvals + coleks + reviews. */
export function unreadCount(
  apps: LoanApplication[],
  meetings: KomiteMeeting[] = [],
  mentions: NotificationItem[] = [],
  approvals: NotificationItem[] = [],
  holidays?: HolidayCalendar,
  coleks: NotificationItem[] = [],
  reviews: NotificationItem[] = [],
): number {
  return (
    buildNotifications(apps).length +
    buildMeetingNotifications(meetings, holidays).length +
    mentions.length +
    approvals.length +
    coleks.length +
    reviews.length
  )
}