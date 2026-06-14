import test from 'node:test'
import assert from 'node:assert/strict'
import type { docs_v1 } from 'googleapis'
import { resolveDocVar, fillApplicationDoc, type DocFillContext } from './seed'
import { DOC_VARS } from '../../lib/templates/doc-registry'
import { formatRupiah, formatTanggal } from '../../lib/sla-utils'
import type { SeedContext } from '../../lib/seed-context'
import type { LoanApplication } from '../../lib/types'

const seed = {
  applicationId: 'FOS-2026-099', nasabahName: 'Budi Santoso', nasabahType: 'business', namaUsaha: 'CV Berkah',
  akadType: 'Murabahah', requestedPlafond: 500_000_000, requestedTenorMonths: 24, purpose: 'Modal kerja',
  marginRate: 12, collateralType: 'fixed_asset', hardGates: { dsr: 30, ltv: 60, kol: 1 }, hardGateViolations: [],
  financialInputs: {
    netMonthlyIncome: 20_000_000, existingMonthlyObligations: 2_000_000, collateralAppraisedValue: 800_000_000,
    proposedMonthlyInstallment: 5_000_000, projectedMonthlyProfitShare: null,
  },
} as unknown as SeedContext

function ctx(over: Partial<DocFillContext> = {}): DocFillContext {
  return {
    app: { id: 'FOS-2026-099', history: [{ timestamp: new Date('2026-06-01') }], approvalSteps: [] } as unknown as LoanApplication,
    seed,
    narratives: {},
    rmName: 'Siti Rahma',
    ...over,
  }
}

const byName = (n: string): typeof DOC_VARS[number] => {
  const v = DOC_VARS.find((x) => x.name === n)
  if (!v) throw new Error(`no registry var ${n}`)
  return v
}

// ── Batch 4 V3.5: NamedRange slot resolvers ──────────────────────────────────
const byRange = (nr: string): typeof DOC_VARS[number] => {
  const v = DOC_VARS.find((x) => x.namedRange === nr)
  if (!v) throw new Error(`no registry var for namedRange ${nr}`)
  return v
}

test('V3.5 — plafond/tenor fill immediately (bare number for the Rp ____,- / ___ Bulan slots)', () => {
  assert.equal(byRange('muap_plafond_facility').method, 'namedRange')
  assert.equal(resolveDocVar(byRange('muap_plafond_facility'), ctx()), '500.000.000') // no "Rp", no ",-"
  assert.equal(resolveDocVar(byRange('muap_plafond_recommendation'), ctx()), '500.000.000')
  assert.equal(resolveDocVar(byRange('muap_tenor'), ctx()), '24') // no " Bulan"
})

test('V3.5 — No. MUAP + Tanggal are NULL until the MUAP ladder is fully signed (official-only)', () => {
  // Not signed yet → null → the NamedRange stays intact (filled later at the finalize pass).
  assert.equal(resolveDocVar(byRange('muap_no_muap_cover'), ctx()), null)
  assert.equal(resolveDocVar(byRange('muap_tanggal_cover'), ctx()), null)

  // MUAP ladder complete (TL is the final rung) → both fill with the LAST signature's date.
  const signed = [
    { chain: 'muap', role: 'muap-author', action: 'request', userId: 'rm', createdAt: new Date('2026-06-01') },
    { chain: 'muap', role: 'muap-approve-tl', action: 'approve', userId: 'tl', createdAt: new Date('2026-06-10') },
  ]
  const signedCtx = ctx({ app: { id: 'FOS-2026-099', history: [], approvalSteps: signed } as unknown as LoanApplication })
  assert.equal(resolveDocVar(byRange('muap_tanggal_cover'), signedCtx), formatTanggal(new Date('2026-06-10')), 'date = last signature')
  assert.equal(resolveDocVar(byRange('muap_no_muap_cover'), signedCtx), '099/MUAP-MKT/VI/2026', 'no = seq/MUAP-MKT/roman-month/year of signing')
  // both identity-table occurrences resolve identically (distinct ranges, same value)
  assert.equal(resolveDocVar(byRange('muap_no_muap_identitas'), signedCtx), '099/MUAP-MKT/VI/2026')
})

test('resolveDocVar — facts resolve from app/seed', () => {
  assert.equal(resolveDocVar(byName('plafond'), ctx()), formatRupiah(500_000_000))
  assert.equal(resolveDocVar(byName('plafond_terbilang'), ctx()), 'lima ratus juta rupiah')
  assert.equal(resolveDocVar(byName('tenor'), ctx()), '24 bulan')
  assert.equal(resolveDocVar(byName('akad'), ctx()), 'Murabahah')
  assert.equal(resolveDocVar(byName('nama_rm'), ctx()), 'Siti Rahma')
})

test('resolveDocVar — MUAP IDENTITAS HUKUM legal-identity facts resolve from seed; null when absent', () => {
  const withLegal = {
    ...seed,
    npwp: '01.234.567.8-901.000', nib: '1234567890123',
    alamat: 'Jl. Merdeka No. 1, Jakarta', bidangUsaha: 'Perdagangan besar',
  } as unknown as SeedContext
  assert.equal(resolveDocVar(byName('nomor_npwp'), ctx({ seed: withLegal })), '01.234.567.8-901.000')
  assert.equal(resolveDocVar(byName('nomor_nib'), ctx({ seed: withLegal })), '1234567890123')
  assert.equal(resolveDocVar(byName('alamat_legal'), ctx({ seed: withLegal })), 'Jl. Merdeka No. 1, Jakarta')
  assert.equal(resolveDocVar(byName('bidang_usaha'), ctx({ seed: withLegal })), 'Perdagangan besar')

  // Absent/undefined → null so the [bracket] placeholder stays (leak-proof).
  const noLegal = { ...seed, npwp: undefined, nib: undefined, alamat: undefined, bidangUsaha: undefined } as unknown as SeedContext
  assert.equal(resolveDocVar(byName('nomor_npwp'), ctx({ seed: noLegal })), null)
  assert.equal(resolveDocVar(byName('nomor_nib'), ctx({ seed: noLegal })), null)
  assert.equal(resolveDocVar(byName('alamat_legal'), ctx({ seed: noLegal })), null)
  assert.equal(resolveDocVar(byName('bidang_usaha'), ctx({ seed: noLegal })), null)
})

test('resolveDocVar — unknown facts return null (placeholder stays)', () => {
  assert.equal(resolveDocVar(byName('nama_rm'), ctx({ rmName: null })), null)
  const noBidang = { ...seed, bidangUsaha: undefined } as unknown as SeedContext
  assert.equal(resolveDocVar(byName('bidang_usaha'), ctx({ seed: noBidang })), null)
})

test('resolveDocVar — narrative resolves when present, null when absent/blank', () => {
  assert.equal(resolveDocVar(byName('m_character'), ctx({ narratives: { m_character: 'Rekam jejak baik.' } })), 'Rekam jejak baik.')
  assert.equal(resolveDocVar(byName('m_character'), ctx()), null)
  assert.equal(resolveDocVar(byName('m_character'), ctx({ narratives: { m_character: '   ' } })), null)
})

test('fillApplicationDoc — replaceAllText only for known values; nulls leave the placeholder (leak-proof)', async () => {
  const requests: docs_v1.Schema$Request[] = []
  const docs = {
    documents: {
      batchUpdate: async ({ requestBody }: { requestBody: { requests: docs_v1.Schema$Request[] } }) => { requests.push(...requestBody.requests); return { data: {} } },
      // V3.5 PASS 2 reads namedRanges; this doc has none → every NamedRange fill skips gracefully.
      get: async () => ({ data: { namedRanges: {} } }),
    },
  } as unknown as docs_v1.Docs

  const res = await fillApplicationDoc(docs, 'doc1', 'muap', ctx({ narratives: { m_character: 'x' } }))
  const targets = requests.map((r) => r.replaceAllText?.containsText?.text)
  assert.ok(targets.includes('[Plafond Terbilang]'), 'known fact filled')
  assert.ok(targets.includes('[Analisis Character]'), 'provided narrative filled')
  assert.ok(!targets.includes('[Analisis Capacity]'), 'absent narrative skipped → placeholder stays')
  assert.ok(!targets.includes('[Tanggal MUAP]'), 'ladder not complete → signing date skipped')
  assert.equal(res.filled, requests.length)
  assert.ok(res.skipped > 0)
})
