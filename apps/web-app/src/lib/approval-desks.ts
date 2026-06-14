import type { Desk } from './desks'
import {
  chainRoles,
  nextApprover,
  type ApprovalAction,
  type ApprovalChain,
  type ApprovalRole,
  type ApprovalStepEntry,
} from './approval-chain'

// Bridge between the desk catalog (desks.ts) and the pure ladder rules (approval-chain.ts),
// kept separate so neither depends on the other. The authors are the existing authoring desks
// (muap-author drafts the MUAP, rsk-author drafts the RSK); the checker rungs are the desks added in
// the maker-checker extension.
export const DESK_OF_APPROVAL_ROLE: Record<ApprovalRole, Desk> = {
  'muap-author': 'muap-author',
  'muap-approve-tl': 'muap-tl',
  'rsk-author': 'rsk-author',
  'rsk-approve-rtl': 'rsk-rtl',
  // SP3 single-reviewer chain (N1): RM drafts (intake), the Legal function reviews (legal desk).
  'sp3-author': 'intake',
  'sp3-legal-review': 'legal',
}

// Human (Bahasa) labels for each rung — the maker first, then the checkers in order.
// NOTE (2026.06.09): the "/ Analis" in the MUAP maker label is a PRE-FOLD VESTIGE. Post ADR-0005
// (AO+LA→RM) the MUAP maker is just the RM — same role, same person/account that handled intake →
// MUAP authoring; there is no separate "RM analis". Consider renaming to 'Pengaju (RM)' (UI copy
// change — left for product confirm, not done here).
export const APPROVAL_ROLE_LABEL: Record<ApprovalRole, string> = {
  'muap-author': 'Pengaju (RM / Analis)',
  'muap-approve-tl': 'Team Leader / Supervisor',
  'rsk-author': 'Pengaju (Analis Risiko)',
  'rsk-approve-rtl': 'Risk Team Leader',
  'sp3-author': 'Penyusun SP3',
  'sp3-legal-review': 'Review Legal SP3',
}

/**
 * The ApprovalRole this actor would act as for `action` on `chain`, given the desks they hold —
 * or null if they hold no eligible desk for the move. `request` resolves to the chain author;
 * `approve`/`reject` resolve to the rung the chain is currently awaiting (only when its desk is
 * held). This is the desk gate; the reducer (validateAction) still has the final say on legality
 * (order + four-eyes). A superadmin holds every desk, so they can always act (break-glass).
 */
export function approvalRoleForActor(
  chain: ApprovalChain,
  action: ApprovalAction,
  ledger: readonly ApprovalStepEntry[],
  heldDesks: readonly Desk[],
): ApprovalRole | null {
  const role = action === 'request' ? chainRoles(chain)[0] : nextApprover(chain, ledger)
  if (!role) return null
  return heldDesks.includes(DESK_OF_APPROVAL_ROLE[role]) ? role : null
}

/**
 * The document signature-slot NamedRange each rung's QR stamps into (document-system.md §Signing).
 * MUAP footer `tanggal_ttd_*` / RSK §IX `rsk_sig_*_tanggal`. A slot absent from a given Doc makes
 * the stamp a no-op (safe best-effort).
 */
export const SIG_SLOT_OF_APPROVAL_ROLE: Record<ApprovalRole, string> = {
  'muap-author': 'tanggal_ttd_rm',
  'muap-approve-tl': 'tanggal_ttd_tl_spv',
  'rsk-author': 'rsk_sig_analyst_tanggal',
  // RTL slot: the RSK master's signature block is updated separately by the template owner
  // (approval-chain-shorten D4). Until the master exposes this NamedRange the stamp is a safe
  // no-op — confirm the slot name with the template owner before relying on it.
  'rsk-approve-rtl': 'rsk_sig_rtl_tanggal',
  // SP3 slots: the SP3 master carries no defined QR NamedRange yet, so these are best-effort
  // anchors — a slot absent from the Doc makes stampSignatureQr a safe no-op (see approval.ts).
  'sp3-author': 'sp3_sig_rm_tanggal',
  'sp3-legal-review': 'sp3_sig_legal_tanggal',
}
