import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyProposalRevision } from './proposal-revision'
import { buildRequiredDocuments } from './required-docs'
import type { LoanApplication } from './types'

function makeApp(over: Partial<LoanApplication> = {}): LoanApplication {
  return {
    nasabahType: 'individual',
    akadType: 'Murabahah',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    marginRate: 12,
    collateralType: 'fixed_asset',
    purpose: 'modal kerja',
    financialInputs: { netMonthlyIncome: 10_000_000, existingMonthlyObligations: 0, collateralAppraisedValue: 200_000_000 },
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    documents: [],
    ...over,
  } as LoanApplication
}

test('applyProposalRevision — recomputes LTV from a new plafond (200M / 200M collateral = 100%)', () => {
  const app = makeApp()
  applyProposalRevision(app, { requestedPlafond: 200_000_000 })
  assert.equal(app.requestedPlafond, 200_000_000)
  assert.equal(app.hardGates.ltv, 100)
})

test('applyProposalRevision — a numeric-only revision does NOT change the doc checklist', () => {
  const docs = buildRequiredDocuments({ nasabahType: 'individual', akadType: 'Murabahah', collateralType: 'fixed_asset' }, 'FOS-T')
  const app = makeApp({ documents: docs })
  applyProposalRevision(app, { requestedTenorMonths: 24 })
  assert.equal(app.documents.length, docs.length)
})

test('applyProposalRevision — an akad change rebuilds the doc checklist, preserving an upload', () => {
  const docs = buildRequiredDocuments({ nasabahType: 'individual', akadType: 'Murabahah', collateralType: 'fixed_asset' }, 'FOS-T')
  docs[0].status = 'uploaded' // a base doc, shared across akad families
  docs[0].fileName = 'base.pdf'
  const sharedType = docs[0].docType
  const app = makeApp({ akadType: 'Murabahah', documents: docs })

  applyProposalRevision(app, { akadType: 'Mudharabah' })

  // the shared base doc kept its upload
  const after = app.documents.find((d) => d.docType === sharedType)
  assert.equal(after?.status, 'uploaded')
  assert.equal(after?.fileName, 'base.pdf')
  // and the set now reflects the Mudharabah required docs
  const expected = buildRequiredDocuments({ nasabahType: 'individual', akadType: 'Mudharabah', collateralType: 'fixed_asset' }, 'FOS-T')
  for (const spec of expected) {
    assert.ok(app.documents.some((d) => d.docType === spec.docType), `missing ${spec.docType}`)
  }
})
