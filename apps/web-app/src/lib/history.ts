import type { HistoryEntry, LoanApplication, Stage } from '@/lib/types'

// Append-only audit trail. Every state-changing action routes through
// appendHistory so the log is complete and every entry id is guaranteed
// unique. The per-application sequence (derived from the current history length,
// NOT a module-global counter — which would reset per server process and collide
// across requests/restarts) doubles as a stable secondary sort key, so two entries
// written in the same millisecond still render deterministically (see
// compareHistory). This is the single writer — components must not push to
// app.history directly.

export interface HistoryInput {
  userId: string
  userName: string
  action: string
  stage: Stage
  reason?: string
}

export function appendHistory(app: LoanApplication, input: HistoryInput): HistoryEntry {
  // Per-app monotonic position. We always load the full history before appending,
  // so length+1 is the next slot — unique within the app and stable across
  // stateless server invocations (saveApplication re-derives the DB `seq` from
  // array order to match).
  const nextSeq = app.history.length + 1
  const entry: HistoryEntry = {
    // zero-padded position → unique id whose lexical order matches insertion order
    id: `h-${String(nextSeq).padStart(7, '0')}-${app.id}`,
    timestamp: new Date(),
    userId: input.userId,
    userName: input.userName,
    action: input.action,
    stage: input.stage,
    ...(input.reason ? { reason: input.reason } : {}),
  }
  app.history.push(entry)
  return entry
}

// Newest-first comparator with a stable tiebreaker. When two entries share a
// timestamp, the higher id (later insertion) sorts first — so the trail never
// flickers or renders out of order, which an OJK auditor relies on.
export function compareHistory(a: HistoryEntry, b: HistoryEntry): number {
  const byTime = b.timestamp.getTime() - a.timestamp.getTime()
  return byTime !== 0 ? byTime : b.id.localeCompare(a.id)
}
