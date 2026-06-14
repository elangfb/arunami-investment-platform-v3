import { phaseOf, type LoanApplication, type Role, type Stage } from '../types'
import { type Desk, DESK_FOR_STAGE, ROLE_OF_DESK, STAGE_OF_DESK } from '../desks'

// Pure authorization helpers — the single source of truth for "can this actor act".
// No 'server-only': used server-side (action/DAL gates) AND client-side (capability/
// nav gates that replace the legacy isRole calls in Phase 3). Keep it pure: it takes
// a resolved Actor (built by verifySession) and a LoanApplication; no I/O.

/**
 * The acting identity, resolved from the verified session. `desks` is the FLATTENED
 * effective set = ⋃(role desks) ∪ direct grants. A real superadmin (NOT impersonating) is
 * workflow-read-only: its set is the ADMIN-* desks + MG observer, never pipeline desks — it acts
 * on the pipeline ONLY by impersonating a real desk/user. The gate logic only ever sees this set.
 */
export interface Actor {
  userId: string
  name: string
  avatarInitials: string
  title?: string
  desks: Desk[]
  isSuperadmin: boolean
  /** Set only while a superadmin is impersonating another identity (Phase 5). */
  impersonating?: { realSuperadminId: string; realName: string }
}

/** Does the actor hold a specific desk? (A read-only superadmin holds admin + MG desks, not pipeline.) */
export function hasDesk(a: Actor, d: Desk): boolean {
  return a.desks.includes(d)
}

/** Does the actor hold ANY of the given desks? Workflow desks require the real grant; admin gates
 *  pass because the superadmin holds the ADMIN-* desks directly (no isSuperadmin bypass). */
export function hasAnyDesk(a: Actor, ...desks: Desk[]): boolean {
  return desks.some((d) => a.desks.includes(d))
}

/** Thrown by the assert* gates below when an actor lacks the required desk. Server
 *  actions let it propagate; the client surfaces it as a toast. Message is Indonesian
 *  (user-facing). A wrong call here is a regulatory failure — fail closed. */
export class AuthzError extends Error {
  constructor(message = 'Tindakan ditolak: Anda tidak memiliki akses untuk tindakan ini.') {
    super(message)
    this.name = 'AuthzError'
  }
}

/** Assert the actor holds at least one of the given desks (no superadmin bypass: workflow asserts
 *  need the real desk; admin asserts pass via the superadmin's held ADMIN-* desks). */
export function assertDesk(a: Actor, ...desks: Desk[]): void {
  if (hasAnyDesk(a, ...desks)) return
  throw new AuthzError(`Tindakan ditolak: memerlukan akses ${desks.join(' atau ')}.`)
}

/** Assert the actor can act on the application at its current stage (holds an owning desk). */
export function assertCanActOnStage(a: Actor, app: LoanApplication): void {
  if (canActOnDesk(a, app)) return
  throw new AuthzError(`Tindakan ditolak: Anda tidak memegang desk untuk tahap ${app.stage}.`)
}

/**
 * The "do-it-early" window. A pipeline desk's owner may work their PREP surfaces early
 * (before the application reaches their stage) for stages 1–4 — the parallelism win
 * (Legal/SLIK/Analysis/Risk start as soon as the data exists). Stages 5–6 (committee,
 * disbursement) are strictly at-stage. Once the app advances PAST a stage, that stage's
 * surfaces lock (stage-move immutability). DECISIONS + forward transitions are not
 * "early" — they stay at-stage (handled in stageActions / the decision actions).
 */
export function canWorkStage(appStage: Stage, ownerStage: Stage): boolean {
  return ownerStage >= 5 ? appStage === ownerStage : appStage <= ownerStage
}

/** Can the actor work the given desk's surfaces NOW (holds it + inside the early-work window)? */
export function canWorkDeskNow(a: Actor, app: LoanApplication, desk: Desk): boolean {
  if (!hasDesk(a, desk)) return false
  const s = STAGE_OF_DESK[desk]
  if (s === null) return true
  // RM-led redesign (ADR-0020 §2, decisions/0020-customer-entity-and-rm-led-pipeline.md): the Inisiasi
  // desks (nominal STAGE_OF_DESK 1–3: intake · slik · legal · appraisal · muap-author) work PHASE-WIDE
  // across the whole Inisiasi phase (stages 1–3, phaseOf===1), replacing the narrower per-stage windows
  // and the former Legal/Appraisal Stage-2-3 special case — under the redesign stages 1–3 collapse into
  // one phase, so the window spans all of Inisiasi. Desks at stage 4–6 are UNCHANGED (canWorkStage).
  if (s <= 3) return phaseOf(app.stage) === 1
  return canWorkStage(app.stage, s)
}

/** Assert the actor may work the desk's prep surfaces now (desk held + in window). */
export function assertCanWorkDesk(a: Actor, app: LoanApplication, desk: Desk): void {
  if (canWorkDeskNow(a, app, desk)) return
  throw new AuthzError(`Tindakan ditolak: desk ${desk} tidak dapat dikerjakan pada tahap ${app.stage}.`)
}

/**
 * Can the actor generate/refresh the advisory bureau summary (SLIK/Pefindo/Rek-Koran digest)?
 * RM-owned (`slik` desk), available from intake (do-it-early, as soon as SLIK exists) THROUGH MUAP
 * feasibility (Stage 3) — the window it supports; past Stage 3 the existing summary stays read-only
 * (Risk owns the case). SHARED by the Data-tab UI + the server action so the affordance and the
 * authorization can't drift — this predicate replaced a client/server mismatch where Stage 1 was
 * UI-hidden-but-server-allowed and Stage 3 was UI-shown-but-server-REJECTED (assertCanWorkDesk('slik')
 * only spans 1–2). The button stays disabled until a SLIK doc is present (UI concern).
 */
export function canSummarizeBureau(a: Actor, app: LoanApplication): boolean {
  return hasDesk(a, 'slik') && app.stage <= 3 && app.applicationStatus !== 'closed'
}

/** A participant can write to shared workflow surfaces (discussion, AI, document mutation).
 *  This means holding a PIPELINE (stage-owning) desk. The MG observer and the cross-cutting
 *  admin desks (ADMIN-*, also non-stage) are NOT workflow participants — admin power is
 *  orthogonal to the pipeline, so a read-only superadmin (admin + MG desks) is NOT a participant. */
export function canParticipate(a: Actor): boolean {
  // `d in STAGE_OF_DESK` guards against a stale/unknown desk string surviving the DB blind-cast
  // (`d.desk as Desk` in server/repo/users.ts): an unknown key would make `STAGE_OF_DESK[d]`
  // undefined, and `undefined !== null` is true — wrongly admitting an orphan-desk persona as a
  // workflow participant (and over the Drive admission boundary). Require a known, stage-owning desk.
  return a.desks.some((d) => d in STAGE_OF_DESK && STAGE_OF_DESK[d] !== null)
}

/** Assert the actor may write to a shared participant surface (not a pure observer). */
export function assertCanParticipate(a: Actor): void {
  if (canParticipate(a)) return
  throw new AuthzError('Tindakan ditolak: peran observer hanya memiliki akses baca.')
}

/**
 * The name to stamp on an audit/history entry. When a superadmin is impersonating,
 * the entry attributes BOTH identities so the OJK trail shows who really acted:
 * "Budi (a.n. Superadmin Luthfi)". Otherwise just the actor's name.
 */
export function auditUserName(a: Actor): string {
  return a.impersonating ? `${a.name} (a.n. Superadmin ${a.impersonating.realName})` : a.name
}

/** The desk(s) that own the application's current stage. */
export function deskForAppStage(app: LoanApplication): Desk[] {
  return DESK_FOR_STAGE[app.stage]
}

/**
 * Can the actor act on this application at its current stage? The actor must hold at least one
 * desk that owns the current stage. No superadmin bypass — a read-only superadmin holds no pipeline
 * desk, so it acts only by impersonating an owning desk/user.
 */
export function canActOnDesk(a: Actor, app: LoanApplication): boolean {
  return deskForAppStage(app).some((d) => a.desks.includes(d))
}

/**
 * The PIPELINE role (RM/LG/RA/CM/MG) to feed stageActions(app, role): the role of
 * the desk the actor holds that owns the current stage. Stage 2 has multiple desks
 * (LG Legal/Appraisal + RM bureau-data) — if the actor holds both, LG is preferred
 * (deterministic; the band can still surface bureau actions). Returns null when the
 * actor holds no owning desk.
 */
export function effectiveRole(a: Actor, app: LoanApplication): Role | null {
  const owning = deskForAppStage(app).filter((d) => a.desks.includes(d))
  if (!owning.length) return null
  // Stable preference order = the order desks are listed for the stage.
  return ROLE_OF_DESK[owning[0]]
}

/**
 * Every PIPELINE role the actor can act as at the application's CURRENT stage — i.e. the
 * distinct roles of the desks they hold that own this stage (superadmin → all owning
 * roles). Stage 2 returns up to ['LG','RM'] for a holder of both stage-2 desks; other
 * stages return one role (or none). Drives the multi-capability task pane (ActionBand),
 * so a multi-desk actor sees a task card per hat instead of just one.
 */
export function actingRolesForStage(a: Actor, app: LoanApplication): Role[] {
  const roles: Role[] = []
  for (const d of DESK_FOR_STAGE[app.stage]) {
    if (!a.desks.includes(d)) continue
    const r = ROLE_OF_DESK[d]
    if (!roles.includes(r)) roles.push(r)
  }
  return roles
}

/**
 * Derive a single PRIMARY pipeline role for an actor, independent of any application.
 * Transitional shim that feeds the legacy `currentUser.role` / `isRole(...)` API
 * (ActorProvider) until Phase 3 migrates those call sites to `hasDesk`. Rule: MG if
 * the actor holds the MG desk (covers superadmin, who holds every desk), else the
 * role of the actor's lowest-stage desk. Falls back to MG (read-only) if deskless —
 * deskless non-superadmins are redirected to /awaiting-access before this is used.
 */
export function primaryRole(a: Actor): Role {
  if (a.desks.includes('MG')) return 'MG'
  let best: { stage: Stage; desk: Desk } | null = null
  for (let stage = 1 as Stage; stage <= 6; stage = (stage + 1) as Stage) {
    const owning = DESK_FOR_STAGE[stage].find((d) => a.desks.includes(d))
    if (owning && (!best || stage < best.stage)) best = { stage, desk: owning }
  }
  return best ? ROLE_OF_DESK[best.desk] : 'MG'
}
