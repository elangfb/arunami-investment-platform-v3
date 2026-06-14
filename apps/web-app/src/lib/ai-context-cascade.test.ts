import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderContextCascade,
  renderCascadeForPolicy,
  renderDerivedPreview,
  buildAiContextLayers,
  type PriorAppSummary,
} from './ai-context-cascade'
import { contextPolicyFor } from './ai-context-policy'
import type { LoanApplication } from './types'

// Pure cascade renderer + layer assembler (RM-led redesign §5 / Topic 5).

test('renderContextCascade → all layers, broad → narrow (customer before app)', () => {
  const out = renderContextCascade({ derived: 'D-FACTS', customerNote: 'C-NOTE', appNote: 'A-NOTE' })
  assert.ok(out.includes('Konteks Nasabah (AUTO)'), 'derived header')
  assert.ok(out.includes('Catatan Nasabah'), 'customer header')
  assert.ok(out.includes('Catatan Pengajuan'), 'app header')
  // broad → narrow ordering
  const iDerived = out.indexOf('Konteks Nasabah (AUTO)')
  const iCustomer = out.indexOf('Catatan Nasabah')
  const iApp = out.indexOf('Catatan Pengajuan')
  assert.ok(iDerived < iCustomer && iCustomer < iApp, 'derived < customer < app')
})

test('renderContextCascade omits empty/blank layers', () => {
  const out = renderContextCascade({ derived: 'D', customerNote: '', appNote: '   ' })
  assert.ok(out.includes('Konteks Nasabah (AUTO)'))
  assert.ok(!out.includes('Catatan Nasabah'), 'empty customer omitted')
  assert.ok(!out.includes('Catatan Pengajuan'), 'blank app omitted')
})

test('renderContextCascade → empty string when ALL layers empty', () => {
  assert.equal(renderContextCascade({}), '')
  assert.equal(renderContextCascade({ derived: '', customerNote: null, appNote: undefined }), '')
})

test('renderContextCascade is compact (a header per present layer, single wrapper)', () => {
  const out = renderContextCascade({ derived: 'D', customerNote: 'C', appNote: 'A' })
  assert.equal((out.match(/^## /gm) ?? []).length, 1, 'one wrapper heading')
  assert.equal((out.match(/^### /gm) ?? []).length, 3, 'three section headers')
})

test('renderCascadeForPolicy(extract) → empty (gate drops every layer)', () => {
  const layers = { derived: 'D', customerNote: 'C', appNote: 'A' }
  assert.equal(renderCascadeForPolicy(layers, contextPolicyFor('extract')), '')
})

test('renderCascadeForPolicy(research) → CUSTOMER ONLY (no derived/app block)', () => {
  const layers = { derived: 'D-FACTS', customerNote: 'C-NOTE', appNote: 'A-NOTE' }
  const out = renderCascadeForPolicy(layers, contextPolicyFor('research'))
  assert.ok(out.includes('Catatan Nasabah') && out.includes('C-NOTE'), 'customer present')
  assert.ok(!out.includes('Konteks Nasabah (AUTO)') && !out.includes('D-FACTS'), 'derived dropped')
  assert.ok(!out.includes('Catatan Pengajuan') && !out.includes('A-NOTE'), 'app dropped')
})

// ── buildAiContextLayers ──────────────────────────────────────────────────────────
function makeApp(over: Partial<LoanApplication> = {}): LoanApplication {
  return {
    id: 'FOS-2026-001',
    nasabahName: 'Budi Santoso',
    nasabahType: 'individual',
    namaUsaha: undefined,
    akadType: 'Murabahah',
    requestedPlafond: 120_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
    marginRate: 10,
    hardGates: { dsr: 30, ltv: 50, kol: 1 },
    hardGateViolations: [],
    financialInputs: {
      netMonthlyIncome: 25_000_000,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 150_000_000,
      proposedMonthlyInstallment: 11_000_000,
      projectedMonthlyProfitShare: null,
    },
    analysis: { character: '', capacity: '', capital: '', condition: '', collateral: '', syariah: '' },
    documents: [],
    ...over,
  } as unknown as LoanApplication
}

test('buildAiContextLayers — derived AUTO block has app facts + origin framing', () => {
  const layers = buildAiContextLayers(makeApp())
  assert.ok(layers.derived?.includes('Budi Santoso'), 'nasabah name in derived')
  assert.ok(layers.derived?.includes('Murabahah'), 'akad in derived')
  assert.ok(layers.derived?.includes('pengajuan baru'), 'original framing (default)')
})

test('buildAiContextLayers — review/adendum gets the compare-to-current framing', () => {
  const review = buildAiContextLayers(makeApp({ originType: 'review' }))
  assert.ok(review.derived?.includes('review dari fasilitas sebelumnya'), 'review framing')
  assert.ok(review.derived?.includes('bandingkan dengan ketentuan terkini'))
  const adendum = buildAiContextLayers(makeApp({ originType: 'adendum' }))
  assert.ok(adendum.derived?.includes('adendum dari fasilitas sebelumnya'), 'adendum framing')
})

test('buildAiContextLayers — customer/app notes pass through; prior apps carry-forward (self excluded)', () => {
  const prior: PriorAppSummary[] = [
    { id: 'FOS-2026-001', akadType: 'Murabahah', requestedPlafond: 120_000_000 }, // self — must drop
    { id: 'FOS-2025-099', akadType: 'Musyarakah', requestedPlafond: 80_000_000, komiteDecision: 'approve' },
  ]
  const layers = buildAiContextLayers(makeApp({ contextMd: 'APP-CATATAN' }), 'CUST-CATATAN', prior)
  assert.equal(layers.customerNote, 'CUST-CATATAN')
  assert.equal(layers.appNote, 'APP-CATATAN')
  assert.ok(layers.derived?.includes('FOS-2025-099'), 'prior app listed')
  assert.ok(layers.derived?.includes('approve'), 'prior outcome carried')
  assert.ok(!layers.derived?.includes('carry-forward\n- FOS-2026-001'), 'self app not in carry-forward')
})

test('buildAiContextLayers — no prior apps, no human notes → only derived layer renders', () => {
  const layers = buildAiContextLayers(makeApp())
  const out = renderCascadeForPolicy(layers, contextPolicyFor('narrative'))
  assert.ok(out.includes('Konteks Nasabah (AUTO)'), 'derived present')
  assert.ok(!out.includes('Catatan Nasabah'), 'no customer note')
  assert.ok(!out.includes('Catatan Pengajuan'), 'no app note')
})

// ── renderDerivedPreview (read-only AUTO block for the contextMd editors) ──────────
test('renderDerivedPreview — derived AUTO block only; never the human "Catatan" layers', () => {
  const out = renderDerivedPreview(makeApp({ contextMd: 'APP-CATATAN' }))
  assert.ok(out.includes('Konteks Nasabah (AUTO)'), 'AUTO derived header present')
  assert.ok(out.includes('Budi Santoso') && out.includes('Murabahah'), 'app facts present')
  // The preview is the AUTO block ONLY — the human note layers must NOT leak in (the editor renders
  // the editable "Catatan" separately, never duplicating it into the read-only preview).
  assert.ok(!out.includes('Catatan Nasabah'), 'no customer-note header')
  assert.ok(!out.includes('Catatan Pengajuan'), 'no app-note header')
  assert.ok(!out.includes('APP-CATATAN'), 'app note body never in the AUTO preview')
})
