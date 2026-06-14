import type { LoanApplication } from '../types'
import { type Actor, hasDesk } from './can'

// Who may EDIT vs VIEW a per-application MUAP/RSK Google Doc — the single source of
// truth shared by the UI tabs (MUAPTab/RSKTab) and the just-in-time Drive permission
// grant (server/docs/access.ts). Keeping both on this one predicate is what stops the
// in-app affordance and the Google Drive grant from drifting: if the UI shows an edit
// button, the grant gives a Drive `writer`; if it only shows the preview, a `reader`.
//
// The Docs are owned by the dedicated Mizan Google account and are NEVER link-shared
// (they carry customer PII). Access is per-email (type=user), least-privilege.

export type DocKind = 'muap' | 'rsk'
export type DriveRole = 'writer' | 'reader'

/** The maker (editor) of the doc at the current stage — EXACT-STAGE, so exactly one of {MUAP, RSK}
 *  is ever editable at a time (Batch 3 / ADR-0015a one-editable-doc): MUAP only at Stage 3 (it is
 *  authored at Stage-3 entry and FREEZES on advance to Risk); RSK only at Stage 4 and only until the
 *  deal is submitted to committee (stage ≥ 5 or a recorded decision). A send-back to Stage 3 reopens
 *  MUAP and re-freezes RSK by the same predicate (flip). Do-it-early RSK editing is deliberately gone
 *  (consistent with RSK grounded in the FINAL MUAP). */
export function canEditDoc(a: Actor, app: Pick<LoanApplication, 'stage' | 'komiteDecision'>, kind: DocKind): boolean {
  if (kind === 'muap') return hasDesk(a, 'muap-author') && app.stage === 3
  const submitted = app.stage >= 5 || Boolean(app.komiteDecision)
  return hasDesk(a, 'rsk-author') && app.stage === 4 && !submitted
}

/** A doc is FROZEN once its single edit stage has passed (Batch 3 T2 / ADR-0016): MUAP after the
 *  advance to Risk (stage > 3), RSK once submitted to committee (stage > 4 or a recorded decision).
 *  A frozen doc must have NO writers in Drive — the grant reconciliation downgrades any to reader.
 *  Independent of actor (a property of the doc + stage), unlike `canEditDoc`. */
export function isDocFrozen(app: Pick<LoanApplication, 'stage' | 'komiteDecision'>, kind: DocKind): boolean {
  if (kind === 'muap') return app.stage > 3
  // RSK is frozen whenever it's OUTSIDE its edit window (the exact inverse of canEditDoc) — including a
  // send-back regress to Stage 3 (Batch 3 T7), where the RSK must re-freeze while the MUAP reopens.
  return app.stage !== 4 || Boolean(app.komiteDecision)
}

/** READ access is UNIVERSAL for authenticated staff (product decision 2026.06.10): every Mizan user
 *  may READ any per-application generated doc (MUAP/RSK — and MoM/SP3 via server/docs/access.ts).
 *  Rationale: the detail nav is already audit-first (every tab is reachable for the committee / OJK
 *  audit), grants stay per-email (never link-shared) + logged + recorded in DocAccessGrant (a full
 *  who-read-what audit trail), and the raw KTP/PII *uploads* remain participant-gated on their own
 *  route. Independence is preserved where it matters — EDITING (canEditDoc stays maker-at-stage) — not
 *  on reading; the risk recommendation is already surfaced to the RM elsewhere. Kept as a function (not
 *  inlined) so the tabs and the Drive grant share ONE predicate and read access can be re-narrowed in
 *  exactly one place. Least-privilege now lives in account provisioning + the writer gate, not per-doc ACLs. */
export function canViewDoc(_a: Actor, _kind: DocKind): boolean {
  return true
}

/** The Drive role the actor should hold on this doc, or null for no access. Writer
 *  wins over reader. When a superadmin is impersonating, `a` is the impersonated
 *  identity (it carries the target's desks) so the ROLE is decided from the desk it is
 *  acting as — while the grant itself goes to the real human at the keyboard (the
 *  superadmin's Google email); see server/docs/access.ts. */
export function driveRoleForDoc(a: Actor, app: Pick<LoanApplication, 'stage' | 'komiteDecision'>, kind: DocKind): DriveRole | null {
  if (canEditDoc(a, app, kind)) return 'writer'
  if (canViewDoc(a, kind)) return 'reader'
  return null
}
