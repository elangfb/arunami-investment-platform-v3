import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { ActorProvider } from '@/context/ActorProvider'
import { verifySession } from '@/server/auth/session'
import { listApplications, listMeetings, listUnansweredMentions } from '@/server/repo'
import { listAwaitingApprovalNotices } from '@/server/notifications/approval-notices'
import { listColekNotices } from '@/server/notifications/colek-notices'
import { listReviewDueNotices } from '@/server/notifications/review-due-notices'
import { resolveHolidayCalendar } from '@/server/config/holidays'
import { unreadCount, buildMentionNotifications, buildApprovalNotifications, buildColekNotifications, buildReviewDueNotifications } from '@/lib/notifications'
import { canActOnDesk } from '@/lib/auth/can'

// Persistent shell for all authenticated routes. Verifies the session SERVER-SIDE
// (the real auth boundary; proxy.ts only does an optimistic cookie check), gates
// access, and feeds the Actor DTO into the client ActorProvider. The shell is
// rendered once and kept mounted across navigation (sidebar state survives).
// /login and /awaiting-access live OUTSIDE this group → no shell there.
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const actor = await verifySession()
  // Reaching here means proxy.ts already saw a session cookie (it redirects cookie-less
  // requests to /login). So a null actor = present-but-INVALID cookie: route through the
  // logout endpoint to CLEAR it, otherwise proxy (/login → /dashboard) and this layout
  // (/dashboard → /login) bounce forever → ERR_TOO_MANY_REDIRECTS.
  if (!actor) redirect('/api/auth/logout')
  // Authenticated but no desk grants (and not superadmin) → awaiting access.
  if (actor.desks.length === 0 && !actor.isSuperadmin) redirect('/awaiting-access')

  const open = (await cookies()).get('sidebar_state')?.value !== 'false'
  const [apps, meetings, mentions, holidays] = await Promise.all([listApplications(), listMeetings(), listUnansweredMentions(actor.userId), resolveHolidayCalendar()])
  // Approval-signature notices are actor-scoped over ALL apps (the signer is not a stage owner, so
  // canActOnDesk would hide their awaiting app — that is exactly the gap this surfaces).
  const approvals = buildApprovalNotifications(await listAwaitingApprovalNotices(apps, actor))
  // Open coleks directed at the actor (cross-desk work requests) — actor-scoped like approvals: the
  // assignee is often not a stage owner of the app, so it would otherwise be invisible on their Home.
  const coleks = buildColekNotifications(await listColekNotices(actor.userId, apps))
  // Review-cadence flags (RM-led redesign §7): facility-derived, filtered to the actor-actionable apps
  // (same canActOnDesk filter the SLA/docs badge uses) so the badge count matches the page.
  const actionableIds = new Set(apps.filter((a) => canActOnDesk(actor, a)).map((a) => a.id))
  const reviews = buildReviewDueNotifications((await listReviewDueNotices()).filter((n) => actionableIds.has(n.appId)))
  // The merged holiday calendar (bundled ∪ admin overrides) feeds the MoM business-day SLA alerts.
  const notifCount = unreadCount(apps.filter((a) => canActOnDesk(actor, a)), meetings, buildMentionNotifications(mentions), approvals, holidays, coleks, reviews)
  const body = (
    <>
      {actor.impersonating && <ImpersonationBanner name={actor.name} realName={actor.impersonating.realName} />}
      {children}
    </>
  )
  return (
    <ActorProvider actor={actor}>
      <AppShell defaultOpen={open} notifCount={notifCount}>
        {body}
      </AppShell>
    </ActorProvider>
  )
}
