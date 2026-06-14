import { log, errField } from '@/server/log'

// Fail-open audit seam (AI audit policy, decided 2026.06.08): run `write` — the AI-interaction
// audit (G3, server/ai/audit.ts) — but a failure logs `logKey` (`<surface>.audit_failed`) and
// NEVER throws, so a transient DB hiccup can't deny a user their already-generated AI output. This
// mirrors the inline try/catch in the bureau/narrative/research surfaces; the assistant + advisory
// surfaces route through here (the two formerly fail-CLOSED paths the policy left misaligned).
//
// Pure (only imports the zero-dep logger — no prisma, no server-only) so it stays hermetically
// unit-testable: the caller injects `write`, keeping the prisma binding out of the seam. `fields`
// are non-PII log context (surface, appId); the wrapped write already masks both prompt + reply.
export async function auditBestEffort(
  write: () => Promise<void>,
  logKey: string,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    await write()
  } catch (e) {
    log.error(logKey, { ...fields, ...errField(e) })
  }
}
