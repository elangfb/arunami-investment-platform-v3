import 'server-only'

import { Page } from '@/components/layout/Page'
import { PersonalKanban } from '@/components/kanban/PersonalKanban'
import { AwaitingSignaturePanel } from '@/components/kanban/AwaitingSignaturePanel'
import { IncomingColekPanel, type IncomingColekView } from '@/components/kanban/IncomingColekPanel'
import { listApplications } from '@/server/repo'
import { listAwaitingApprovalNotices } from '@/server/notifications/approval-notices'
import { listColekNotices } from '@/server/notifications/colek-notices'
import { buildApprovalNotifications } from '@/lib/notifications'
import { requireActor } from '@/server/auth/session'

export default async function DashboardPage() {
  const actor = await requireActor()
  const applications = await listApplications()
  // Signature directives for the checker rungs (TL, RTL) — they're not stage owners,
  // so the Kanban below would otherwise hide these. Same source as the badge + /notifications.
  const awaitingSignature = buildApprovalNotifications(await listAwaitingApprovalNotices(applications, actor))
  // Incoming coleks (cross-desk work requested OF this user) — same reason: the assignee is often not a
  // stage owner of the app, so the Kanban hides it. Same source as the badge + /notifications.
  const incomingColeks: IncomingColekView[] = (await listColekNotices(actor.userId, applications)).map((n) => ({
    colekId: n.colekId,
    appId: n.appId,
    nasabahName: n.nasabahName,
    targetDesk: n.targetDesk,
    requestedByName: n.requestedByName,
    description: n.description,
  }))

  return (
    <Page.Root>
      <IncomingColekPanel items={incomingColeks} />
      <AwaitingSignaturePanel items={awaitingSignature} />
      <PersonalKanban applications={applications} />
    </Page.Root>
  )
}
