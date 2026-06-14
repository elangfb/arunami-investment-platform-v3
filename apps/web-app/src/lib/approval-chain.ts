// Pure maker-checker ladder logic for the command-sourced workflow engine.
//
// No I/O, no DB, no coupling to the global Role/Desk catalog — this is the reducer
// over an append-only `ApprovalStep` ledger (one row per signer action). The actions
// layer (server/actions/approval.ts) maps a held desk → an ApprovalRole and persists
// the ledger row; ALL the maker-checker rules (order, distinct approvers, the
// send-back cycle) live here so they are unit-testable in isolation and have one home.
//
// Design: docs/designs/workflow-engine.md §Approval · docs/designs/workflow-target.md
// §"Aturan tetap" · docs/planning/workflow-rm-maker-checker.md (Build slice 1 spec).

/**
 * The signature ladders: the MUAP + RSK maker-checker chains, plus the SP3 single-reviewer
 * Legal-review chain (N1, docs/designs/rm-led-pipeline-redesign.md §4). SP3 rides the SAME
 * approval-chain primitive — its completion is a disbursement PREREQUISITE, never a stage gate
 * (it is deliberately NOT in CHAIN_COMPLETE_ADVANCE; see lib/stage-action.ts).
 */
export type ApprovalChain = 'muap' | 'rsk' | 'sp3'

/**
 * Ladder roles, in signing order. Stage-independent (the actions layer resolves a
 * held desk to one of these). MUAP: RM → TL/SPV. RSK: RA → Risk Team Leader (RTL).
 * SP3: RM drafts → a single Legal reviewer (the Legal function of the Legal & Appraisal desk).
 * (Chains shortened 2026.06.12 — BM/KU, Risk Officer, CRO, and DPS-as-signer rungs dropped, ADR-0021.
 * The DPS signature was the only ENFORCED sharia control; its intended replacement — a Stage-5
 * `dps-review` conditional gate — is DESIGNED, NOT BUILT (see ADR-0021 §Decision.4 for the open gap).)
 */
export type ApprovalRole =
  | 'muap-author'
  | 'muap-approve-tl'
  | 'rsk-author'
  | 'rsk-approve-rtl'
  | 'sp3-author'
  | 'sp3-legal-review'

// 'reset' invalidates a chain (a proposal revision made the document stale) — appended by the
// revise path, NOT a user ladder action. It returns the chain to `idle` so the maker must re-draft
// + re-`request`, mirroring "editing a signed doc voids its signatures" (docs/designs/workflow-engine.md).
export type ApprovalAction = 'request' | 'approve' | 'reject' | 'reset'

/** The ledger fields the pure logic reads. The persisted row carries more (id, reason, createdAt). */
export interface ApprovalStepEntry {
  // A ledger row may belong to a ladder chain (muap/rsk/sp3) OR the committee MoM attestation set
  // (chain='mom', role='komite-signer'). The ladder reducer filters by the chain param, so mom rows
  // ride along in the same array and are simply ignored by chainState/currentCycleSteps/validateAction.
  chain: ApprovalChain | 'mom'
  role: ApprovalRole | 'komite-signer'
  action: ApprovalAction
  /** The acting user — drives the distinct-approver ("four eyes") rule. */
  userId: string
}

interface ChainConfig {
  /** The maker who drafts the document and `request`s approval. */
  author: ApprovalRole
  /** The checkers who `approve` in this exact order; the last one freezes the doc. */
  checkers: ApprovalRole[]
}

const CHAINS: Record<ApprovalChain, ChainConfig> = {
  // MUAP: RM drafts → TL/SPV (TL approve freezes MUAP → flows to Risk).
  muap: { author: 'muap-author', checkers: ['muap-approve-tl'] },
  // RSK: Risk Analyst drafts → Risk Team Leader (RTL signs, freezes RSK → Komite queue).
  rsk: { author: 'rsk-author', checkers: ['rsk-approve-rtl'] },
  // SP3: RM drafts the offer letter → a SINGLE Legal reviewer approves (single-reviewer chain →
  // isChainComplete true after that one approve). Completion is a DISBURSEMENT prerequisite, NOT a
  // stage advance — sp3 is intentionally absent from CHAIN_COMPLETE_ADVANCE (lib/stage-action.ts).
  sp3: { author: 'sp3-author', checkers: ['sp3-legal-review'] },
}

/** Every role in a chain, in order: [author, ...checkers]. */
export function chainRoles(chain: ApprovalChain): ApprovalRole[] {
  const c = CHAINS[chain]
  return [c.author, ...c.checkers]
}

/**
 * The state of a chain, derived purely from its ledger:
 * - `idle`     — never requested (or only stale prior cycles).
 * - `awaiting` — a request is open and `role` is the next checker who must act.
 * - `rejected` — a checker sent it back; the maker must edit and re-`request`.
 * - `complete` — every checker approved in order → the document freezes.
 */
export type ChainState =
  | { status: 'idle' }
  | { status: 'awaiting'; role: ApprovalRole }
  | { status: 'rejected'; by: ApprovalRole }
  | { status: 'complete' }

/**
 * The entries of the CURRENT request-cycle: everything from the latest `request` onward
 * (inclusive). A send-back + re-`request` starts a new cycle — which is what mints a new
 * document version + fresh QRs upstream. Empty when no request exists yet. Exported (generic so
 * callers keep their richer row type, e.g. the QR token) to render the ladder UI per rung.
 */
export function currentCycleSteps<T extends ApprovalStepEntry>(
  chain: ApprovalChain,
  ledger: readonly T[],
): T[] {
  const mine = ledger.filter((e) => e.chain === chain)
  let lastRequest = -1
  for (let i = 0; i < mine.length; i++) if (mine[i].action === 'request') lastRequest = i
  return lastRequest === -1 ? [] : mine.slice(lastRequest)
}

export function chainState(chain: ApprovalChain, ledger: readonly ApprovalStepEntry[]): ChainState {
  const { checkers } = CHAINS[chain]
  const cycle = currentCycleSteps(chain, ledger)
  if (cycle.length === 0) return { status: 'idle' }
  // A 'reset' (proposal-revision invalidation) terminates the cycle → idle: the document is stale,
  // so the maker must re-draft and re-request (which starts a fresh cycle).
  if (cycle[cycle.length - 1].action === 'reset') return { status: 'idle' }

  // cycle[0] is the request; the rest are checker actions in insertion order.
  let approved = 0
  for (const e of cycle.slice(1)) {
    if (e.action === 'reject') return { status: 'rejected', by: e.role as ApprovalRole } // ladder chain → role is an ApprovalRole (mom rows filtered out by chain)
    if (e.action === 'approve') approved++
  }
  if (approved >= checkers.length) return { status: 'complete' }
  return { status: 'awaiting', role: checkers[approved] }
}

/** The checker whose approval is next, or null if not awaiting one (idle/rejected/complete). */
export function nextApprover(
  chain: ApprovalChain,
  ledger: readonly ApprovalStepEntry[],
): ApprovalRole | null {
  const s = chainState(chain, ledger)
  return s.status === 'awaiting' ? s.role : null
}

/** True once every checker has approved in order — the gate that freezes the doc + advances. */
export function isChainComplete(chain: ApprovalChain, ledger: readonly ApprovalStepEntry[]): boolean {
  return chainState(chain, ledger).status === 'complete'
}

export type ActionCheck = { ok: true } | { ok: false; reason: string }

/**
 * Whether the proposed action is legal RIGHT NOW against the ledger — the single guard
 * the write path consults before appending a row. Enforces: only the maker requests;
 * approvals happen strictly in ladder order; the current rung's checker is the only one
 * who may approve/reject; and every approver is a different person from the maker and
 * prior approvers ("penyetuju harus berbeda" / four-eyes). Reasons are user-facing (Bahasa).
 */
export function validateAction(
  chain: ApprovalChain,
  ledger: readonly ApprovalStepEntry[],
  proposed: { role: ApprovalRole; action: ApprovalAction; userId: string },
): ActionCheck {
  const { author } = CHAINS[chain]
  const state = chainState(chain, ledger)
  const { role, action, userId } = proposed

  // 'reset' is a system invalidation (revise path appends it directly) — never a user ladder action.
  if (action === 'reset') return { ok: false, reason: 'Pembatalan otomatis bukan aksi pengguna.' }

  if (action === 'request') {
    if (role !== author) return { ok: false, reason: 'Hanya pembuat dokumen yang dapat mengajukan persetujuan.' }
    if (state.status === 'awaiting') return { ok: false, reason: 'Rantai persetujuan masih berjalan.' }
    if (state.status === 'complete') return { ok: false, reason: 'Dokumen sudah final — tidak dapat diajukan ulang.' }
    return { ok: true }
  }

  // approve | reject — only the awaited checker, acting as a distinct person, may proceed.
  if (state.status !== 'awaiting') {
    return { ok: false, reason: 'Tidak ada permintaan persetujuan yang menunggu.' }
  }
  if (role !== state.role) {
    return { ok: false, reason: `Giliran persetujuan ada pada ${state.role}, bukan ${role}.` }
  }
  const priorActors = new Set(currentCycleSteps(chain, ledger).map((e) => e.userId))
  if (priorActors.has(userId)) {
    return { ok: false, reason: 'Penyetuju harus orang yang berbeda dari pembuat dan penyetuju sebelumnya.' }
  }
  return { ok: true }
}
