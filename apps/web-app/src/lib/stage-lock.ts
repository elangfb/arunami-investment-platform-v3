// Stage-move immutability for the app-canonical analysis layer.
//
// The MUAP/RSK Google Docs are frozen + hashed at the committee decision, but the
// app-side analysis (5C+1S, shown in AnalysisTab) is NOT — so to keep it trustworthy
// as the record, each editable data group is locked once the application advances PAST
// the stage where it's authored. Editability is derived from the stage; no extra state.
//
// (Extend AUTHORING_STAGE next session as more groups move app-canonical, e.g.
// financialInputs / riskRecommendation.)

import type { LoanApplication } from './types'

// The stage at which each group is authored. Editing is allowed only while the app is
// AT that stage; once it moves on, the group is immutable.
export const AUTHORING_STAGE = {
  analysis: 3, // 5C+1S — Loan Analyst (Feasibility)
} as const

export type LockGroup = keyof typeof AUTHORING_STAGE

// True once the application has advanced past the authoring stage (group is frozen).
export function isLocked(app: LoanApplication, group: LockGroup): boolean {
  return app.stage > AUTHORING_STAGE[group]
}

// True while the group may still be edited: at OR before the authoring stage (the
// "do-it-early" window — see lib/auth/can.ts canWorkStage), and not yet locked (the app
// hasn't advanced past it).
export function canAuthor(app: LoanApplication, group: LockGroup): boolean {
  return app.stage <= AUTHORING_STAGE[group]
}
