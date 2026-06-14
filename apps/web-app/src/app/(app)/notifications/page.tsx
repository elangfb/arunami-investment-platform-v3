import { Page } from '@/components/layout/Page'
import { NotificationsList, type NotificationView } from '@/components/notifications/NotificationsList'
import { buildNotifications, buildMeetingNotifications, buildMentionNotifications, buildApprovalNotifications, buildColekNotifications, buildReviewDueNotifications, sortNotifications } from '@/lib/notifications'
import { formatRelativeTime } from '@/lib/sla-utils'
import { listApplications, listMeetings, listUnansweredMentions } from '@/server/repo'
import { listAwaitingApprovalNotices } from '@/server/notifications/approval-notices'
import { listColekNotices } from '@/server/notifications/colek-notices'
import { listReviewDueNotices } from '@/server/notifications/review-due-notices'
import { resolveHolidayCalendar } from '@/server/config/holidays'
import { requireActor } from '@/server/auth/session'
import { canActOnDesk } from '@/lib/auth/can'

export default async function NotificationsPage() {
  const actor = await requireActor()
  const [applications, meetings, mentions, holidays] = await Promise.all([listApplications(), listMeetings(), listUnansweredMentions(actor.userId), resolveHolidayCalendar()])
  // Severity-sorted, relative-time pre-formatted on the server so the client
  // island can't drift between SSR and hydration. Mentions are actor-specific.
  const approvals = buildApprovalNotifications(await listAwaitingApprovalNotices(applications, actor))
  const coleks = buildColekNotifications(await listColekNotices(actor.userId, applications))
  // Review-cadence flags (RM-led redesign §7): actor-agnostic like the SLA/docs builders, so filter to
  // the facilities the actor can act on (mirrors the buildNotifications filter below).
  const actionableIds = new Set(applications.filter((a) => canActOnDesk(actor, a)).map((a) => a.id))
  const reviews = buildReviewDueNotifications((await listReviewDueNotices()).filter((n) => actionableIds.has(n.appId)))
  const items: NotificationView[] = sortNotifications([
    ...buildNotifications(applications.filter((a) => canActOnDesk(actor, a))),
    ...buildMeetingNotifications(meetings, holidays),
    ...buildMentionNotifications(mentions),
    ...approvals,
    ...coleks,
    ...reviews,
  ]).map((n) => ({
    id: n.id,
    title: n.title,
    description: n.description,
    severity: n.severity,
    category: n.category,
    appId: n.appId,
    nasabahName: n.nasabahName,
    relativeTime: formatRelativeTime(n.timestamp),
    href: n.href,
    cta: n.cta,
  }))

  return (
    <Page.Root>
      <Page.Header
        title="Notifikasi"
        description="Aksi yang perlu ditindaklanjuti di aplikasi pembiayaan — diurutkan berdasarkan tingkat urgensi."
      />
      <NotificationsList items={items} />
    </Page.Root>
  )
}
