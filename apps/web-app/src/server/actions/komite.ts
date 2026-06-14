'use server'

import { appendHistory } from '@/lib/history'
import { dispatch } from '@/lib/workflow-engine'
import { akadConfig } from '@/lib/akad-config'
import { attendeeUpdateError, meetingForApp, momComplete, momRequiredSignerIds, voteLabels } from '@/lib/komite'
import { validateApprovedTerms, validateDecisionNote } from '@/lib/komite-terms'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { completeMeetingIfAllDecided, createMeeting, listMeetings, meetingHasMomSignatures, setMeetingAttendees, setMeetingMinutes, setMeetingSchedule, setMeetingStatus } from '@/server/repo'
import { log } from '@/server/log'
import { freezeDecisionArchive } from '@/server/docs/service'
import { requireActor } from '@/server/auth/session'
import { stageOwnerResolver } from '@/server/auth/stage-owners'
import type { StageOwner } from '@/lib/stage-owners'
import { assertDesk, auditUserName, AuthzError, type Actor } from '@/lib/auth/can'
import { appendMomSignature, loadMomSignatures } from '@/server/repo/approval'
import type { KomiteMeeting, KomiteVoteValue, LoanApplication, Stage } from '@/lib/types'

// Committee actions read identity from the verified session (requireActor) and gate on the committee
// desk. The Ketua records the outcome (setKomiteOutcomeAction); attending Komite QR-sign the MoM
// (signMomAction); the recorded decision applies + the app routes on the last signature (ADR-0005).
// Scheduling + minutes-SLA actions follow below.


export interface DecisionInput {
  decision: KomiteVoteValue
  decisionNote: string
  approvedPlafond?: number
  approvedTenorMonths?: number
  approvedMarginRate?: number | null
}


/// Apply the routing for a recorded Komite decision (the MoM-signed finalisation, ADR-0005):
/// approve → Pencairan (Stage 6); conditional/reject → RM (Stage 1).
function routeOnKomiteDecision(app: LoanApplication, decision: KomiteVoteValue, actor: Actor, resolveOwners: (stage: Stage) => StageOwner[]): void {
  if (decision === 'approve') {
    app.disbursementStatus = 'Verifikasi Final'
    dispatch(app, { kind: 'SystemTransition', transition: { action: 'Disetujui Komite — masuk tahap Pencairan', targetStage: 6, requireReason: false } }, actor, undefined, resolveOwners)
  } else {
    dispatch(
      app,
      {
        kind: 'SystemTransition',
        transition: {
          action:
            decision === 'conditional'
              ? 'Keputusan bersyarat — dikembalikan ke RM untuk tindak lanjut nasabah'
              : 'Ditolak Komite — dikembalikan ke RM untuk komunikasi ke nasabah',
          targetStage: 1,
          requireReason: false,
        },
      },
      actor,
      undefined,
      resolveOwners,
    )
  }
}

/// ADR-0005 step 1 — the Ketua RECORDS the per-app outcome (no routing yet). Validates the note
/// (Conditional/Reject require one) + approved terms, and is FROZEN once any MoM signature exists.
/// The decision only applies when every attending Komite member has signed the MoM (signMomAction).
export async function setKomiteOutcomeAction(appId: string, input: DecisionInput): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'komite')
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)

  const meetings = await listMeetings()
  const meeting = meetings.find((m) => m.status === 'upcoming' && m.agendaAppIds.includes(appId)) ?? meetingForApp(meetings, appId)
  if (!meeting) throw new Error('Tidak ada sidang komite untuk aplikasi ini.')
  if (meeting.chairUserId !== actor.userId) {
    throw new AuthzError('Hanya Ketua sidang komite yang dapat menetapkan keputusan.')
  }
  // Freeze-on-first-signature: once the MoM has any signature, the recorded outcome is locked.
  if ((await loadMomSignatures(appId)).length > 0) {
    throw new Error('Keputusan terkunci — MoM sudah mulai ditandatangani.')
  }

  const { decision, decisionNote } = input
  const noteError = validateDecisionNote(decision, decisionNote)
  if (noteError) throw new Error(noteError)
  const isFlatAkad = akadConfig(app.akadType).usesMargin
  if (decision === 'approve') {
    const termsError = validateApprovedTerms(app, input, isFlatAkad)
    if (termsError) throw new Error(termsError)
    app.approvedPlafond = input.approvedPlafond
    app.approvedTenorMonths = input.approvedTenorMonths
    app.approvedMarginRate = isFlatAkad ? (input.approvedMarginRate ?? null) : null
  }
  app.komiteDecision = decision
  app.komiteDecisionNote = decisionNote.trim() || undefined
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action: `Keputusan Komite dicatat: ${voteLabels[decision]} (menunggu tanda tangan MoM)`,
    stage: app.stage,
    reason:
      decision === 'approve'
        ? `Plafond disetujui Rp ${Number(input.approvedPlafond).toLocaleString('id-ID')} (diajukan Rp ${app.requestedPlafond.toLocaleString('id-ID')}); Tenor ${input.approvedTenorMonths} bln; ${decisionNote.trim() || ''}`
        : decisionNote.trim() || undefined,
  })
  return saveApplication(app)
}

/// ADR-0005 step 2 — an attending member QR-signs the per-app MoM (unordered attestation, reuses the
/// ApprovalStep ledger). ANY meeting attendee may sign: the attending Komite are the BLOCKING signers
/// (momComplete gates routing on them), added involved-team participants attest (non-blocking). When
/// the last required Komite signs (quorate), the recorded decision applies and the app routes.
export async function signMomAction(appId: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  if (!app.komiteDecision) throw new Error('Ketua belum mencatat keputusan Komite untuk aplikasi ini.')

  const meetings = await listMeetings()
  const meeting = meetings.find((m) => m.status === 'upcoming' && m.agendaAppIds.includes(appId)) ?? meetingForApp(meetings, appId)
  if (!meeting) throw new Error('Tidak ada sidang komite untuk aplikasi ini.')
  const required = momRequiredSignerIds(meeting)
  if (!meeting.attendeeUserIds.includes(actor.userId)) {
    throw new AuthzError('Hanya peserta yang hadir di rapat ini yang dapat menandatangani MoM.')
  }
  const existing = await loadMomSignatures(appId)
  if (existing.some((s) => s.userId === actor.userId)) {
    throw new Error('Anda sudah menandatangani MoM aplikasi ini.')
  }

  const updated = await appendMomSignature({
    appId,
    expectedVersion: app.version ?? 0,
    userId: actor.userId,
    userName: actor.name,
    audit: { action: `Tanda tangan MoM (${required.includes(actor.userId) ? 'Komite' : 'peserta'}) — ${actor.name}`, stage: app.stage },
  })

  // Last required signature → the decision applies + the app routes (2nd version-guarded write).
  const signedIds = [...existing.map((s) => s.userId), actor.userId]
  if (momComplete(signedIds, required)) {
    const fresh = await loadApplicationForWrite(appId)
    if (fresh && fresh.komiteDecision && fresh.applicationStatus !== 'closed' && fresh.stage === 5) {
      routeOnKomiteDecision(fresh, fresh.komiteDecision, actor, await stageOwnerResolver())
      const routed = await saveApplication(fresh)
      await completeMeetingIfAllDecided(appId)
      // Batch 3 T6: the immutable decision archive is part of THIS server flow, not a client
      // fire-and-forget. A failure is recorded hard (error log + audit entry on the app), so an app
      // can never silently decide without an archive. Re-load to surface any failure-audit entry.
      const freeze = await freezeDecisionArchive(appId, fresh.komiteDecision, actor)
      return (!freeze.ok ? await loadApplicationForWrite(appId) : null) ?? routed
    }
  }
  return updated
}

export interface ScheduleMeetingInput {
  date: string
  time: string
  room?: string
  meetingUrl?: string
  agendaAppIds: string[]
  attendeeUserIds: string[]
  chairUserId: string
  notes?: string
}

export async function scheduleMeetingAction(input: ScheduleMeetingInput): Promise<KomiteMeeting> {
  const actor = await requireActor()
  assertDesk(actor, 'komite-admin') // session administration is RM's (sekretariat), not a committee member's
  // id is allocated atomically inside createMeeting (advisory-locked txn) — no pre-read here.
  return createMeeting({
    date: input.date,
    time: input.time,
    room: input.room?.trim() || undefined,
    meetingUrl: input.meetingUrl?.trim() || undefined,
    agendaAppIds: input.agendaAppIds,
    attendeeUserIds: input.attendeeUserIds,
    chairUserId: input.chairUserId,
    notes: input.notes?.trim() || undefined,
    status: 'upcoming',
    createdBy: actor.userId,
    createdAt: new Date(),
  })
}

/// Reschedule a meeting (ADR-0005 #13). Allowed while the meeting is proposed/upcoming, but FROZEN
/// once any agenda app's MoM has a signature (a signed MoM fixes the recorded meeting time). The
/// "warn after the MoM is drafted" friction is a UI confirm — the server only enforces the freeze.
export async function editMeetingTimeAction(meetingId: string, date: string, time: string): Promise<KomiteMeeting> {
  const actor = await requireActor()
  assertDesk(actor, 'komite-admin')
  if (!date || !time) throw new Error('Tanggal dan waktu wajib diisi.')
  const meeting = (await listMeetings()).find((m) => m.id === meetingId)
  if (!meeting) throw new Error('Rapat tidak ditemukan.')
  if (meeting.status === 'completed' || meeting.status === 'cancelled') {
    throw new Error('Rapat sudah selesai atau dibatalkan — waktu tidak dapat diubah.')
  }
  if (await meetingHasMomSignatures(meetingId)) {
    throw new Error('Waktu rapat terkunci — MoM sudah mulai ditandatangani.')
  }
  return setMeetingSchedule(meetingId, date, time)
}

/// Correct the meeting's attendee list (Batch 8 / gap #19). The attendee set is captured at schedule
/// time, but real attendance is only known on the day — a registered Komite member who no-shows would
/// otherwise sit in momRequiredSignerIds forever and deadlock the MoM. The sekretariat (komite-admin =
/// RM) edits the real attendance. Mirrors editMeetingTimeAction's lifecycle: allowed while the meeting
/// is proposed/upcoming, FROZEN the moment any agenda app's MoM carries a signature (the signed record
/// fixes who was present). The chair must remain among the attendees. Quorum is NOT enforced here — it
/// is enforced at finalisation (momComplete needs ≥ MIN_KOMITE_QUORUM). Audit: who changed, before→after.
export async function updateMeetingAttendeesAction(meetingId: string, attendeeUserIds: string[]): Promise<KomiteMeeting> {
  const actor = await requireActor()
  assertDesk(actor, 'komite-admin')
  const meeting = (await listMeetings()).find((m) => m.id === meetingId)
  if (!meeting) throw new Error('Rapat tidak ditemukan.')
  const next = Array.from(new Set(attendeeUserIds))
  const err = attendeeUpdateError(meeting, await meetingHasMomSignatures(meetingId), next)
  if (err) throw new Error(err)
  log.info('komite.attendees_updated', { meetingId, by: actor.userId, before: meeting.attendeeUserIds, after: next })
  return setMeetingAttendees(meetingId, next)
}

export async function confirmProposedMeetingAction(meetingId: string): Promise<KomiteMeeting> {
  const actor = await requireActor()
  assertDesk(actor, 'komite-admin')
  const meetings = await listMeetings()
  const meeting = meetings.find((m) => m.id === meetingId)
  if (!meeting) throw new Error('Rapat tidak ditemukan.')
  if (meeting.status !== 'proposed') throw new Error('Hanya rapat berstatus usulan yang dapat dikonfirmasi.')
  if (meeting.agendaAppIds.length === 0) throw new Error('Usulan rapat belum memiliki agenda aplikasi.')
  return setMeetingStatus(meetingId, 'upcoming')
}

export async function cancelProposedMeetingAction(meetingId: string): Promise<KomiteMeeting> {
  const actor = await requireActor()
  assertDesk(actor, 'komite-admin')
  const meetings = await listMeetings()
  const meeting = meetings.find((m) => m.id === meetingId)
  if (!meeting) throw new Error('Rapat tidak ditemukan.')
  if (meeting.status !== 'proposed') throw new Error('Hanya rapat berstatus usulan yang dapat dibatalkan.')
  return setMeetingStatus(meetingId, 'cancelled')
}

/// The chair records the minutes-of-meeting (MOM / notulen) for a COMPLETED session — the ≤H+1
/// SLA artifact (lib/komite.meetingMomSlaState). Chair-only (or superadmin), mirroring the decision
/// gate: only the Ketua of that meeting may record its minutes. Recording stops the MOM SLA clock.
export async function recordMeetingMinutesAction(meetingId: string, minutes: string): Promise<KomiteMeeting> {
  const actor = await requireActor()
  assertDesk(actor, 'komite')
  const text = minutes.trim()
  if (!text) throw new Error('Notulen tidak boleh kosong.')
  const meeting = (await listMeetings()).find((m) => m.id === meetingId)
  if (!meeting) throw new Error('Rapat tidak ditemukan.')
  if (meeting.status !== 'completed') throw new Error('Notulen hanya dapat dicatat untuk sidang yang telah selesai.')
  if (meeting.chairUserId !== actor.userId) {
    throw new AuthzError('Hanya Ketua sidang yang dapat mencatat notulen.')
  }
  return setMeetingMinutes(meetingId, text, actor.userId)
}
