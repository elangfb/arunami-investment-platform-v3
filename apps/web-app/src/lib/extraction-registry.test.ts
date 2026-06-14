import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FIELD_REGISTRY,
  ADVISORY_KEYS,
  advisorySuggestionsFor,
  ocrSuggestionsFor,
  getFieldExtractor,
  validateNik,
  validateKol,
  validatePositiveAmount,
  validateNpwp,
  validateNib,
  validateAlamat,
  deriveConfidence,
  reconcileExtraction,
  extractionValuesEqual,
  planMismatchResolution,
} from './extraction-registry'

test('registry covers the extractable fields with owners', () => {
  const byPath = Object.fromEntries(FIELD_REGISTRY.map((f) => [f.fieldPath, f]))
  assert.equal(byPath['nik'].ownerDesk, 'intake')
  assert.equal(byPath['hardGates.kol'].ownerDesk, 'slik')
  assert.equal(byPath['financialInputs.netMonthlyIncome'].ownerDesk, 'muap-author')
  assert.equal(byPath['financialInputs.collateralAppraisedValue'].ownerDesk, 'muap-author')
  // Batch 9 legal-identity fields — intake-owned, identity kind, string-valued.
  assert.equal(byPath['npwp'].ownerDesk, 'intake')
  assert.equal(byPath['npwp'].kind, 'identity')
  assert.equal(byPath['nib'].kind, 'identity')
  assert.equal(byPath['alamat'].kind, 'identity')
})

test('getFieldExtractor — resolves a fieldPath to its registry entry (drives confirm gate + advance gate)', () => {
  assert.equal(getFieldExtractor('nik')?.ownerDesk, 'intake')
  assert.equal(getFieldExtractor('nik')?.kind, 'identity')
  assert.equal(getFieldExtractor('financialInputs.netMonthlyIncome')?.kind, 'gating')
  assert.equal(getFieldExtractor('does.not.exist'), undefined)
})

test('ocrSuggestionsFor — SLIK text yields a valid Kol', () => {
  const out = ocrSuggestionsFor('slik_report', 'LAPORAN SLIK\nKolektibilitas terkini: Kol 1\n')
  assert.deepEqual(out, [{ fieldPath: 'hardGates.kol', value: 1 }])
})

test('ocrSuggestionsFor — laporan keuangan picks NET line, never omzet', () => {
  const text = 'LAPORAN KEUANGAN\nPendapatan usaha (omzet) per bulan: Rp 83.200.000\nLaba bersih per bulan: Rp 20.800.000\n'
  const out = ocrSuggestionsFor('laporan_keuangan', text)
  assert.deepEqual(out, [{ fieldPath: 'financialInputs.netMonthlyIncome', value: 20_800_000 }])
})

test('ocrSuggestionsFor — appraisal yields collateral value', () => {
  const out = ocrSuggestionsFor('appraisal_agunan', 'APPRAISAL\nNilai pasar wajar agunan: Rp 400.000.000\n')
  assert.deepEqual(out, [{ fieldPath: 'financialInputs.collateralAppraisedValue', value: 400_000_000 }])
})

test('ocrSuggestionsFor — no confident parse → empty (stays manual, no fabrication)', () => {
  assert.deepEqual(ocrSuggestionsFor('slik_report', 'tidak ada angka kol di sini'), [])
  assert.deepEqual(ocrSuggestionsFor('ktp', 'KTP apa pun'), [], 'ktp owns no text-parsed field')
})

// ── Batch 9: legal-identity suggestions (string-valued, intake-owned) ─────────
test('ocrSuggestionsFor — NPWP/NIB docs yield string identity suggestions', () => {
  assert.deepEqual(ocrSuggestionsFor('npwp', 'NPWP Perusahaan\n09.254.294.3-407.000'), [{ fieldPath: 'npwp', value: '09.254.294.3-407.000' }])
  // A NIB doc carries BOTH the NIB number and the legal address → registry order (nib, alamat).
  const nibDoc = 'NIB (Nomor Induk Berusaha): 1234567890123\nAlamat: Jl. Merdeka No. 10, Jakarta Pusat'
  assert.deepEqual(ocrSuggestionsFor('nib', nibDoc), [
    { fieldPath: 'nib', value: '1234567890123' },
    { fieldPath: 'alamat', value: 'Jl. Merdeka No. 10, Jakarta Pusat' },
  ])
})

test('identity validators — NPWP 15/16 digit, NIB 13 digit, alamat min length', () => {
  assert.ok(validateNpwp('09.254.294.3-407.000').ok) // 15 digits dotted
  assert.ok(validateNpwp('3275010101800001').ok) // 16 digits
  assert.ok(!validateNpwp('123').ok)
  assert.ok(validateNib('1234567890123').ok)
  assert.ok(!validateNib('12345').ok)
  assert.ok(validateAlamat('Jl. Merdeka 10').ok)
  assert.ok(!validateAlamat('JKT').ok)
})

test('validators reject out-of-range values (defense vs untrusted confidence)', () => {
  assert.ok(validateNik('3201234567890123').ok)
  assert.ok(!validateNik('320123').ok, 'short NIK rejected')
  assert.ok(validateKol(3).ok)
  assert.ok(!validateKol(0).ok && !validateKol(6).ok, 'Kol out of 1..5 rejected')
  assert.ok(validatePositiveAmount(5_000_000).ok)
  assert.ok(!validatePositiveAmount(0).ok)
})

// ── Batch 6: OCR cross-check (verify, don't blind-overwrite) ──────────────────
test('reconcileExtraction — fill on unblessed; match/mismatch on a blessed value', () => {
  // empty / still a raw suggestion → fill (legacy behavior preserved)
  assert.equal(reconcileExtraction(undefined, undefined, 5), 'fill')
  assert.equal(reconcileExtraction(2, 'ocr_suggested', 5), 'fill', 'a bare suggestion is not blessed')
  // blessed (human/confirmed/overridden) + OCR agrees → match (no-op)
  assert.equal(reconcileExtraction(5, 'ocr_confirmed', 5), 'match')
  assert.equal(reconcileExtraction('3201234567890123', 'human_entered', '3201234567890123'), 'match')
  // blessed + OCR differs → mismatch (record, keep the Mizan value)
  assert.equal(reconcileExtraction(2, 'ocr_confirmed', 5), 'mismatch')
  assert.equal(reconcileExtraction('3201234567890123', 'ocr_overridden', '3209999999999999'), 'mismatch')
})

test('extractionValuesEqual — numeric tolerant; null/empty never equal', () => {
  assert.equal(extractionValuesEqual(5, '5'), true, 'number vs numeric string')
  assert.equal(extractionValuesEqual(20_800_000, 20_800_000), true)
  assert.equal(extractionValuesEqual(2, 5), false)
  assert.equal(extractionValuesEqual(null, 5), false)
  assert.equal(extractionValuesEqual(5, undefined), false)
})

test('extractionValuesEqual — distinct high-province NIKs that collide under Number() are NOT equal (16-digit > 2^53)', () => {
  // Two DISTINCT 16-digit NIK strings (province code 91 / Papua) whose Number() coercion
  // rounds to the SAME double — 9171000000000000 === 9171000000000001 numerically because
  // 16 digits exceed 2^53 (9,007,199,254,740,992). Identity must compare as trimmed strings.
  const a = '9171000000000000'
  const b = '9171000000000001'
  assert.notEqual(a, b, 'the two NIK strings are genuinely different')
  assert.equal(Number(a), Number(b), 'precondition: they collide under Number() (double rounding)')
  assert.equal(extractionValuesEqual(a, b), false, 'distinct NIKs must NOT compare equal despite the Number() collision')
  // A blessed NIK re-read as the near-collision sibling must surface as a mismatch (the 1→2 OCR
  // identity gate depends on this — a silent EQUAL would bypass the gate).
  assert.equal(reconcileExtraction(a, 'human_entered', b), 'mismatch', 'blessed NIK + near-collision OCR → mismatch')
})

test('planMismatchResolution — keep leaves value; accept writes OCR; NIK never leaks into audit', () => {
  const nik = { kind: 'identity' as const, label: 'NIK', validate: validateNik }
  const kol = { kind: 'gating' as const, label: 'Kolektibilitas', validate: validateKol }
  const nikMismatch = { existingValue: '3201234567890123', ocrValue: '3209999999999999' }

  // keep → no write; audit holds NO raw NIK
  const keep = planMismatchResolution(nik, nikMismatch, 'keep')
  assert.equal(keep.acceptValue, null)
  assert.ok(!keep.audit.includes('3201234567890123') && !keep.audit.includes('3209999999999999'), 'NIK must not appear in the audit ledger (PII)')

  // accept → writes the OCR value; identity audit still PII-free
  const accept = planMismatchResolution(nik, nikMismatch, 'accept')
  assert.equal(accept.acceptValue, '3209999999999999')
  assert.ok(!accept.audit.includes('3209999999999999'), 'NIK value not in audit even on accept')

  // gating accept records the numeric delta (safe, non-PII) and coerces to number
  const acceptKol = planMismatchResolution(kol, { existingValue: '2', ocrValue: '4' }, 'accept')
  assert.equal(acceptKol.acceptValue, 4)
  assert.match(acceptKol.audit, /2 → 4/)

  // accept of an INVALID OCR value throws (never write bad data)
  assert.throws(() => planMismatchResolution(kol, { existingValue: '2', ocrValue: '9' }, 'accept'), /Kol/)
})

test('deriveConfidence — gating fields are ALWAYS review, never auto-fill', () => {
  assert.equal(deriveConfidence(0.99, 'gating'), 'review', 'high confidence still review for gating')
  assert.equal(deriveConfidence(null, 'gating'), 'review')
  assert.equal(deriveConfidence(0.95, 'identity'), 'high')
  assert.equal(deriveConfidence(0.7, 'identity'), 'review')
  assert.equal(deriveConfidence(0.3, 'identity'), 'low')
  assert.equal(deriveConfidence(null, 'identity'), 'review')
})

// ── ADVISORY OCR-widening invariant (RM-led design §3) — front-loaded: advisory NEVER gates ──
test('advisory fields are registered and parse from their docTypes', () => {
  const advisory = FIELD_REGISTRY.filter((f) => f.kind === 'advisory')
  const keys = advisory.map((f) => f.fieldPath)
  for (const k of ['omzet', 'labaBersih', 'pendapatanSpt', 'saldoRataRata', 'bakiDebet', 'fasilitasAktif', 'nilaiPasar', 'nilaiLikuidasi']) {
    assert.ok(keys.includes(k), `advisory registry missing ${k}`)
  }
  // advisorySuggestionsFor is the SEPARATE advisory path — it returns advisory keys only.
  const lapkeu = advisorySuggestionsFor('laporan_keuangan', 'Omzet usaha Rp 1.200.000.000\nLaba Bersih Rp 150.000.000')
  assert.deepEqual(lapkeu.map((s) => s.key).sort(), ['labaBersih', 'omzet'])
  // ocrSuggestionsFor (the GATING path) must NEVER surface an advisory key.
  const gating = ocrSuggestionsFor('laporan_keuangan', 'Omzet usaha Rp 1.200.000.000\nLaba Bersih Rp 150.000.000')
  for (const s of gating) assert.ok(!ADVISORY_KEYS.has(s.fieldPath), `advisory key ${s.fieldPath} leaked into the gating suggestion path`)
})

test('CRITICAL — every advisory fieldPath is NOT a gating/identity LoanApplication path', () => {
  // A gating/identity entry writes to a LoanApplication path (nik, hardGates.kol, financialInputs.*…).
  // Advisory keys are keys into advisoryExtractions, NOT app paths — they must be disjoint from every
  // gating/identity fieldPath, so an advisory value can never reach a hard gate or identity field.
  const gatingPaths = new Set(FIELD_REGISTRY.filter((f) => f.kind !== 'advisory').map((f) => f.fieldPath))
  for (const key of ADVISORY_KEYS) {
    assert.ok(!gatingPaths.has(key), `advisory key ${key} collides with a gating/identity path`)
    // and is not itself a known gate input substring
    assert.ok(!key.startsWith('hardGates.') && !key.startsWith('financialInputs.'), `advisory key ${key} looks like a gate path`)
    // getFieldExtractor resolves it to an advisory entry (never a gating one)
    assert.equal(getFieldExtractor(key)?.kind, 'advisory')
  }
})
