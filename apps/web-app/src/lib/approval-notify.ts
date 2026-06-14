import { chainState, currentCycleSteps, type ApprovalChain, type ApprovalStepEntry } from './approval-chain'
import { DESK_OF_APPROVAL_ROLE } from './approval-desks'
import type { RoutingMap } from './approval-routing'
import type { ApprovalNotice } from './notifications'
import type { Desk } from './desks'

// Pure resolver for the "menunggu tanda tangan Anda" approval notices (approval-routing-config.md
// gap #2). The ladder checker signers (TL, RTL) are NOT stage owners, so an awaiting app
// is otherwise invisible to them; this surfaces it on /notifications + the badge. The server injects
// `routingFor` (the active per-(maker, chain) routing from the DB) so this stays pure + testable.

// All maker-checker chains whose awaiting rung pushes a "menunggu tanda tangan Anda" notice.
// 'sp3' is the single-reviewer Legal chain (N1, docs/designs/rm-led-pipeline-redesign.md §4): the
// awaited Legal reviewer is not a stage owner of the deal, so without this push the pending SP3
// review would be invisible on their Home — same rationale as the MUAP/RSK checker signers.
const CHAINS: readonly ApprovalChain[] = ['muap', 'rsk', 'sp3']

export interface ApprovalActorView {
  userId: string
  desks: readonly Desk[]
}

interface AppForApproval {
  id: string
  nasabahName: string
  enteredStageAt: Date
  approvalSteps?: ApprovalStepEntry[]
}

/**
 * For each app whose MUAP/RSK ladder is awaiting a rung the actor is an ELIGIBLE signer of, an
 * approval notice. Eligibility = the actor HOLDS the rung's desk AND (the rung is unconfigured →
 * any holder, OR the routed account IS the actor). Superadmin break-glass is intentionally NOT
 * surfaced here (it would notify on every awaiting app); break-glass remains available on demand
 * via the engine gate. Mirrors the actor-scoped mention resolver.
 */
export function awaitingApprovalNotices(
  apps: readonly AppForApproval[],
  actor: ApprovalActorView,
  routingFor: (makerUserId: string, chain: ApprovalChain) => RoutingMap | null,
): ApprovalNotice[] {
  const notices: ApprovalNotice[] = []
  for (const app of apps) {
    const ledger = app.approvalSteps ?? []
    for (const chain of CHAINS) {
      const state = chainState(chain, ledger)
      if (state.status !== 'awaiting') continue
      const role = state.role
      if (!actor.desks.includes(DESK_OF_APPROVAL_ROLE[role])) continue
      const maker = currentCycleSteps(chain, ledger)[0]?.userId
      const routed = maker ? routingFor(maker, chain)?.[role] : undefined
      if (routed && routed !== actor.userId) continue // configured to someone else
      notices.push({ appId: app.id, nasabahName: app.nasabahName, chain, role, at: app.enteredStageAt })
    }
  }
  return notices
}
