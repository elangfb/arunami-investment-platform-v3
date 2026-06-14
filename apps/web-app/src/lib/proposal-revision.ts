import type { ApplicationDocument, LoanApplication } from '@/lib/types'
import { computeHardGates } from '@/lib/financials'
import { buildRequiredDocuments } from '@/lib/required-docs'

// Pre-Komite proposal revision (Phase 4, docs/planning/workflow-engine-build.md + workflow-engine.md
// "Proposal vs workflow"). The proposal — akad, plafond, tenor, margin, collateral, purpose — is
// mutable working state the RM revises freely through pre-Komite negotiation; each revision is a
// +HistoryEntry, NOT a workflow transition. This is the PURE state change (fields + hard gates +
// the doc checklist); the action layer (reviseProposalAction) adds the audit, the chain-reset
// cascade (a revised proposal makes a signed MUAP/RSK stale), and the stage regression.

export interface ProposalRevision {
  akadType?: LoanApplication['akadType']
  requestedPlafond?: number
  requestedTenorMonths?: number
  marginRate?: LoanApplication['marginRate']
  collateralType?: LoanApplication['collateralType']
  purpose?: string
}

/**
 * Apply a proposal revision to the aggregate (mutates `app`): set the changed fields, recompute the
 * DSR/LTV hard gates from the new terms + existing financial inputs, and rebuild the required-doc
 * checklist if a doc-determining axis changed. `hardGateViolations` is the derived cache recomputed
 * at the saveApplication seam, so it is intentionally NOT set here.
 */
export function applyProposalRevision(app: LoanApplication, rev: ProposalRevision): void {
  if (rev.akadType !== undefined) app.akadType = rev.akadType
  if (rev.requestedPlafond !== undefined) app.requestedPlafond = rev.requestedPlafond
  if (rev.requestedTenorMonths !== undefined) app.requestedTenorMonths = rev.requestedTenorMonths
  if (rev.marginRate !== undefined) app.marginRate = rev.marginRate
  if (rev.collateralType !== undefined) app.collateralType = rev.collateralType
  if (rev.purpose !== undefined) app.purpose = rev.purpose

  const fi = app.financialInputs
  const { dsr, ltv } = computeHardGates({
    requestedPlafond: app.requestedPlafond,
    requestedTenorMonths: app.requestedTenorMonths,
    akadType: app.akadType,
    netMonthlyIncome: fi?.netMonthlyIncome ?? 0,
    existingMonthlyObligations: fi?.existingMonthlyObligations ?? 0,
    collateralAppraisedValue: fi?.collateralAppraisedValue ?? 0,
    projectedMonthlyProfitShare: fi?.projectedMonthlyProfitShare,
    marginRate: app.marginRate,
  })
  app.hardGates = { ...app.hardGates, dsr, ltv }

  if (rev.akadType !== undefined || rev.collateralType !== undefined) rebuildRequiredDocuments(app)
}

/**
 * Re-derive the required-document checklist for the new akad/collateral, merged with the existing docs:
 * a still-required doc keeps its prior upload + verification; a newly-required doc is added as missing;
 * an UPLOADED doc that is no longer required is kept (audit) but marked not-required; an unused
 * no-longer-required doc is dropped.
 */
function rebuildRequiredDocuments(app: LoanApplication): void {
  const required = buildRequiredDocuments(
    {
      nasabahType: app.nasabahType as 'individual' | 'business',
      akadType: app.akadType,
      isMarried: app.isMarried ?? undefined,
      incomeSource: app.incomeSource ?? undefined,
      collateralType: app.collateralType ?? undefined,
    },
    app.id,
  )
  const requiredTypes = new Set(required.map((d) => d.docType))
  const existingByType = new Map(app.documents.map((d) => [d.docType, d]))

  const merged: ApplicationDocument[] = required.map((spec) => {
    const existing = existingByType.get(spec.docType)
    return existing ? { ...existing, name: spec.name, required: true } : spec
  })
  for (const doc of app.documents) {
    if (requiredTypes.has(doc.docType)) continue
    if (doc.status === 'uploaded') merged.push({ ...doc, required: false })
  }
  app.documents = merged
}
