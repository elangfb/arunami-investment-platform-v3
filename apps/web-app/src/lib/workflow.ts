import { phaseOf, type Stage, type LoanApplication, type WorkflowStep, type WorkflowSnapshot } from './types'

// WorkflowStep / WorkflowStatus / WorkflowSnapshot are defined in ./types (the pure type module) so
// LoanApplication can carry the persisted snapshot without a types↔workflow cycle; re-exported here
// because consumers import them from '@/lib/workflow' (the seam).
export type { WorkflowStep, WorkflowStatus, WorkflowSnapshot } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Workflow seam (Phase 2 of the engine build, docs/planning/workflow-engine-build.md).
//
// Named, behaviour-preserving step model aligned 1:1 to the current engine stages, plus the
// SEMANTIC PREDICATES that consumers should ask instead of comparing raw stage integers
// ("is this pre-Komite?" not "stage < 5"). These predicates are the stable seam: Phase 3 makes
// the WorkflowSnapshot authoritative and exposes `stage` as a derived accessor, so everything
// reading through these helpers (and through `app.stage`) keeps working across the cutover.
//
// The finer target step model (the 1→16 of workflow-target.md) arrives with the snapshot; this
// is the compat layer that gets us there without a 150-site big-bang.
// ─────────────────────────────────────────────────────────────────────────────

// (step model + STEP_OF_STAGE/STAGE_OF_STEP live below; the WorkflowStep type is imported from ./types)

const STEP_OF_STAGE: Record<Stage, WorkflowStep> = {
  1: 'intake',
  2: 'legal-slik',
  3: 'feasibility',
  4: 'risk',
  5: 'komite',
  6: 'pencairan',
}

const STAGE_OF_STEP: Record<WorkflowStep, Stage> = {
  'intake': 1,
  'legal-slik': 2,
  'feasibility': 3,
  'risk': 4,
  'komite': 5,
  'pencairan': 6,
}

/** Minimal shape so predicates work on a full LoanApplication or a `{ stage }` stub (tests/seed). */
type HasStage = { stage: Stage }

export const stepOf = (app: HasStage): WorkflowStep => STEP_OF_STAGE[app.stage]
export const stageOfStep = (step: WorkflowStep): Stage => STAGE_OF_STEP[step]

/** At exactly this step. */
export const isAt = (app: HasStage, step: WorkflowStep): boolean => app.stage === STAGE_OF_STEP[step]
/** At or past this step (the "early-work / has-reached" question). */
export const isAtOrAfter = (app: HasStage, step: WorkflowStep): boolean => app.stage >= STAGE_OF_STEP[step]
/** Strictly before this step. */
export const isBefore = (app: HasStage, step: WorkflowStep): boolean => app.stage < STAGE_OF_STEP[step]

/**
 * Pre-Komite span (Origination + Risk) — the freely-iterative negotiation window where the
 * proposal is mutable (Phase 4 `ReviseProposal` gates on this). Frozen at the Komite decision.
 */
export const isPreKomite = (app: HasStage): boolean => app.stage < STAGE_OF_STEP['komite']


export function deriveWorkflowSnapshot(app: LoanApplication): WorkflowSnapshot {
  return {
    phase: phaseOf(app.stage),
    step: STEP_OF_STAGE[app.stage],
    status: app.applicationStatus === 'closed' ? 'closed' : 'active',
    closeReason: app.closeReason ?? null,
  }
}
