// Pure COLEK first-assignment resolver (RM-led redesign, design Follow-up-decisions "A1 colek").
//
// COLEK = an in-app directed work request: one desk nudges another desk to do work on an application
// (request + notify + track). This decides WHO the request lands on. Two rules, in order:
//   1. STICKY (per app×desk start-to-end): if a stickyUserId is supplied AND that user is still a
//      candidate (holds the target desk), it ALWAYS wins — a colek re-raised for the same app×desk
//      keeps landing on the same person. (The repo's activeColekForDesk also prevents a duplicate
//      open colek; this is the assignee-stability half of "sticky".)
//   2. LOAD-BALANCE (first assignment / sticky absent): the candidate with the FEWEST active deals;
//      ties broken by LEAST-RECENTLY-ASSIGNED (oldest lastAssignedAt). A null lastAssignedAt means
//      never assigned = most available = wins a tie (sorts oldest).
//
// PURE + deterministic: no Date.now / I/O. The caller (server/actions/colek-actions.core.ts) builds
// the ColekCandidate[] from server/repo/colek.ts activeDealCountsByDesk.

/** One candidate user (a holder of the target desk) for a colek, with their current caseload. */
export interface ColekCandidate {
  userId: string
  name: string
  /** Active (non-terminal: pending/in_progress) coleks currently assigned to this user. */
  activeDeals: number
  /** ISO timestamp of this user's most-recent colek assignment, or null if never assigned. */
  lastAssignedAt: string | null
}

/** Sort key for "least-recently-assigned": a null lastAssignedAt (never assigned) is the OLDEST
 *  (most available), so it must sort before any real timestamp. Map null → -Infinity. */
function assignedRank(c: ColekCandidate): number {
  return c.lastAssignedAt == null ? Number.NEGATIVE_INFINITY : new Date(c.lastAssignedAt).getTime()
}

/**
 * Resolve the assignee for a colek. STICKY wins when present among candidates; otherwise load-balance
 * (fewest active deals; tie → least-recently-assigned, null = oldest). Returns null for no candidates.
 */
export function resolveColekAssignee(
  candidates: ColekCandidate[],
  stickyUserId?: string | null,
): ColekCandidate | null {
  if (candidates.length === 0) return null

  if (stickyUserId) {
    const sticky = candidates.find((c) => c.userId === stickyUserId)
    if (sticky) return sticky
  }

  // Fewest active deals; tie → oldest assignment (null = -Infinity = oldest). Deterministic reduce
  // (keeps the first candidate on a full tie — no Array.sort instability across engines).
  return candidates.reduce((best, c) => {
    if (c.activeDeals !== best.activeDeals) return c.activeDeals < best.activeDeals ? c : best
    return assignedRank(c) < assignedRank(best) ? c : best
  })
}
