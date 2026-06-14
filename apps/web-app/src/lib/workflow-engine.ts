import { applyDecision, decide, stage2RmDataReady, type TransitionConfig, type WorkflowCommand } from './stage-action'
import { appendHistory } from './history'
import { assertCanActOnStage, AuthzError, auditUserName, type Actor } from './auth/can'
import type { LoanApplication, Stage } from './types'
import type { StageOwner } from './stage-owners'

// ─────────────────────────────────────────────────────────────────────────────
// Command dispatch seam (Phase 3, docs/planning/workflow-engine-build.md).
//
// dispatch() is the single command entry point: it asserts authz + command guards, then applies
// the command to a LOADED application (mutating it), leaving load/save/post-effects to the caller
// (the server action). It is session-free + I/O-free → unit-testable with a seeded app + actor.
//
// Why the manual-transition guards live HERE, not in the pure decide() reducer: they gate the
// user-initiated `Transition` path only. The system-consequence advances (`SystemTransition` for
// the ladder-complete / Komite / conditional-accept / revise-regress paths, and `DualSignOff` for
// the explicit Stage 2→3 handoff) reach the same decide()/applyDecision() core but MUST bypass
// these guards — so the guards belong at this dispatch layer, not in the reducer every advance shares.
// ─────────────────────────────────────────────────────────────────────────────

export function ctxFor(actor: Actor) {
  return {
    addHistory: (target: LoanApplication, action: string, stage: Stage, reason?: string) =>
      appendHistory(target, { userId: actor.userId, userName: auditUserName(actor), action, stage, reason }),
  }
}

/**
 * Manual-transition guards (server-side, non-bypassable; server actions are POST-reachable).
 * Stage 2→3 must go via the explicit dual handoff; 3→4 / 4→5 only via a FINAL signature ladder;
 * 1→2 only once the intake checkpoint (docs + AO-OCR + Initial-AML) clears. Throws AuthzError.
 */
export function assertTransitionAllowed(app: LoanApplication, transition: TransitionConfig): void {
  if (app.stage === 2 && transition.targetStage === 3) {
    throw new AuthzError('Tahap 2 harus dikirim lewat handoff eksplisit Legal dan SLIK, bukan transisi langsung.')
  }
  if (app.stage === 3 && transition.targetStage === 4) {
    throw new AuthzError('MUAP harus final (rantai persetujuan lengkap di tab MUAP) sebelum masuk Review Risiko.')
  }
  if (app.stage === 4 && transition.targetStage === 5) {
    throw new AuthzError('RSK harus final (tanda tangan lengkap di tab RSK) sebelum masuk Komite.')
  }
  // RM-led redesign (ADR-0020 §2): the 1→2 advance is now FREE — the intake hard gates
  // (docs · intake OCR · NIK-mismatch · AML) relocated to the MUAP→Risk submit
  // (lib/stage-action.ts muapToRiskBlockers, enforced in server/actions/approval.ts via
  // makerSubmitGateError('muap')). The TRIGGER stays (transitionAction still dispatches the
  // 1→2 Transition); only the BLOCKING moved. Do NOT re-add a 1→2 intake-blocker throw here.
}

/**
 * Apply a WorkflowCommand to a loaded application via decide() → applyDecision(). A user `Transition`
 * asserts actor-owns-stage + the manual-transition guards; system commands bypass them (their
 * producing action already authorized). Mutates `app`; the caller persists + runs post-save effects.
 */
export function dispatch(
  app: LoanApplication,
  command: WorkflowCommand,
  actor: Actor,
  reason?: string,
  resolveOwners?: (stage: Stage) => StageOwner[],
): { autoSkipped: boolean } {
  // Open the target-stage assignments for the REAL grant-holders when a resolver is supplied
  // (the server actions pass one, sourced from live desk grants); otherwise applyDecision falls
  // back to the seed `ownersForStage` (tests / seed). Decision computed first so we know the stage.
  const apply = (decision: ReturnType<typeof decide>) =>
    applyDecision(app, decision, ctxFor(actor), reason, resolveOwners?.(decision.stage))
  switch (command.kind) {
    case 'Transition':
      // User-initiated manual transition: the actor must own the current stage AND the transition
      // must clear the manual-transition guards (dual-handoff / signature-ladder / intake gates).
      assertCanActOnStage(actor, app)
      assertTransitionAllowed(app, command.transition)
      apply(decide(app, command))
      return { autoSkipped: false }
    case 'SystemTransition':
      // Consequence of an already-authorized action (ladder complete, Komite decision, conditional
      // accept, revision regress) — the producing action did its own desk authz, so this bypasses
      // the manual-transition guards (which would reject 3→4 / 4→5 / off-desk regressions).
      apply(decide(app, command))
      return { autoSkipped: false }
    case 'DualSignOff':
      // ADR-0007: the Stage 2→3 advance is RM-coordinated — it fires on RM's bureau-data handoff (SLIK
      // + Kol), NOT on a Legal sign-off. Legal & Appraisal complete in parallel and gate MUAP→Risk
      // (enforced at the MUAP-ladder request). autoSkipped reports whether the advance fired.
      if (!(app.stage === 2 && stage2RmDataReady(app))) return { autoSkipped: false }
      apply(decide(app, command))
      return { autoSkipped: true }
    default:
      throw new Error(`Unknown workflow command: ${(command as { kind: string }).kind}`)
  }
}
