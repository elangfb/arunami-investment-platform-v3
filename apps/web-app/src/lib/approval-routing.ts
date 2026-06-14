import { chainRoles, type ApprovalChain, type ApprovalRole } from './approval-chain'

// Pure per-submitter approval ROUTING (approval-routing-config.md). Separates ROUTING (which
// account a rung is sent to) from AUTHORITY (the desk grant + four-eyes/order rules in
// approval-chain.ts, which stay in code and non-editable). Routing picks AMONG the authorized — it
// NARROWS authority, never expands it. No I/O: the DB read lives in server/config/approval-routing.ts.

/** A routing map for one (maker, chain): checker-rung ApprovalRole → designated approver userId. */
export type RoutingMap = Partial<Record<ApprovalRole, string>>

/**
 * STRICT authority narrowing for one rung — may THIS actor sign `role`?
 *  - superadmin → always true (ADR-0010 break-glass for deadlock recovery);
 *  - no rule for the rung → true (fallback to "all desk holders" = today's behavior);
 *  - rule exists → only the routed account.
 * This is consulted IN ADDITION to the desk gate (approvalRoleForActor) and validateAction (order +
 * four-eyes), which remain the backstops — routing can only further restrict, never open.
 */
export function routingAllowsActor(
  routing: RoutingMap | null | undefined,
  role: ApprovalRole,
  userId: string,
  isSuperadmin: boolean,
): boolean {
  if (isSuperadmin) return true
  const routed = routing?.[role]
  return !routed || routed === userId
}

/**
 * SoD pre-validation of a proposed routing config for a (maker, chain) — mirrors the engine
 * four-eyes/order backstop at config time so an admin gets an early, actionable (Bahasa) error.
 * Rejects: routing a rung to the maker (self-approval); the same account on two distinct rungs
 * (would violate distinct-approver); a key that is not a CHECKER rung of the chain. Empty = valid.
 * Does NOT check desk-holding (needs user grants — enforced by the engine desk gate at sign time).
 */
export function validateRoutingConfig(chain: ApprovalChain, makerUserId: string, routing: RoutingMap): string[] {
  const problems: string[] = []
  const checkerRoles: readonly string[] = chainRoles(chain).slice(1)
  const seenApprover = new Map<string, string>()
  for (const [role, approver] of Object.entries(routing)) {
    if (!checkerRoles.includes(role)) {
      problems.push(`Rung "${role}" bukan tahap checker untuk rantai ${chain}.`)
      continue
    }
    if (!approver) continue // empty → unconfigured rung (fallback), not an error
    if (approver === makerUserId) {
      problems.push(`Rung "${role}" tidak boleh dirutekan ke pembuat dokumen (four-eyes).`)
    }
    const dup = seenApprover.get(approver)
    if (dup) {
      problems.push(`Satu akun tidak boleh menandatangani dua rung (${dup} & ${role}).`)
    } else {
      seenApprover.set(approver, role)
    }
  }
  return problems
}

/**
 * Normalize an untrusted JSON value (the DB `routing` column or raw admin input) into a RoutingMap
 * for `chain`: keep only non-empty string approver ids on the chain's CHECKER rungs; drop the rest.
 * Fail-safe — anything malformed yields {} (→ unconfigured → fallback), never a throw.
 */
export function parseRoutingMap(json: unknown, chain: ApprovalChain): RoutingMap {
  const map: RoutingMap = {}
  if (!json || typeof json !== 'object' || Array.isArray(json)) return map
  const obj = json as Record<string, unknown>
  for (const role of chainRoles(chain).slice(1)) {
    const v = obj[role]
    if (typeof v === 'string' && v.trim()) map[role] = v
  }
  return map
}
