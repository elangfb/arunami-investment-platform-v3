import type { AmlAttestation, LoanApplication } from '@/lib/types'

// Stage-1 Initial-AML attestation (OJK APU-PPT segregation of duties).
//
// MIZAN performs NO screening. The DTTOT/PEP/negative-list check is done EXTERNALLY by
// CS/Compliance. The RM (intake desk) attests that the *initial* external check happened and
// PASSED — MIZAN is not the authoritative AML clearer. UI/wording must NEVER imply MIZAN
// screened. See docs/handoffs/2026.06.03-aml-attestation-gate.

// The exact affirmation the RM ticks. V1 code constant (not admin-configurable); revisit with the
// AiPromptVersion versioned-config pattern if the Bank ever wants versioned wording. Snapshotted
// onto each AmlAttestation at attestation time so the audit record is self-describing.
export const AML_ATTESTATION_STATEMENT =
  'Initial AML checking (DTTOT/PEP/negative-list) telah dilakukan dan hasilnya PASSED.'

// The history-trail action text written when the RM attests (the authoritative OJK record).
export const AML_ATTESTATION_HISTORY = 'Atestasi Initial AML: PASSED (DTTOT/PEP/negative-list)'

// The 1→2 blocker message shown when the gate is unmet.
export const AML_GATE_MESSAGE = 'Atestasi Initial AML (DTTOT/PEP/negative-list) belum dilakukan.'

// True once the RM has attested. Treats absent (undefined) and null identically — both mean
// "not attested" → the 1→2 gate blocks. This is the single readiness predicate; do not inline
// `!!app.amlAttestation` elsewhere.
export const amlAttested = (app: Pick<LoanApplication, 'amlAttestation'>): boolean =>
  !!app.amlAttestation

// P3-D structured AML upgrade (design §4): the optional structured fields the RM may record alongside
// the bare affirmation. ALL optional — an attestation with none of these is the legacy (still valid)
// record. `result`/`catatan`/`screenedParties`/`evidenceDocId` enrich the record Risk/Komite weigh.
// A 'hit-cleared' result is a SIGNAL, never an auto-blocker (completion gates; the verdict doesn't).
export interface AmlAttestationInput {
  result?: 'clear' | 'hit-cleared'
  catatan?: string
  screenedParties?: { nama: string; peran?: string }[]
  evidenceDocId?: string
}

// Build the structured attestation record. Identity is the verified actor (NEVER the client);
// `attestedByName` is auditUserName(actor) so superadmin impersonation is recorded. The optional
// `extra` carries the P3-D structured fields (design §4) — omitted keys are simply absent (back-compat).
export function buildAmlAttestation(
  attestedBy: string,
  attestedByName: string,
  extra: AmlAttestationInput = {},
): AmlAttestation {
  return {
    attestedBy,
    attestedByName,
    attestedAt: new Date().toISOString(),
    statement: AML_ATTESTATION_STATEMENT,
    // Spread only the provided structured fields so a bare attestation stays { 4 keys } (back-compat).
    ...(extra.result !== undefined ? { result: extra.result } : {}),
    ...(extra.catatan !== undefined ? { catatan: extra.catatan } : {}),
    ...(extra.screenedParties !== undefined ? { screenedParties: extra.screenedParties } : {}),
    ...(extra.evidenceDocId !== undefined ? { evidenceDocId: extra.evidenceDocId } : {}),
  }
}

// P3-D AML fresh-attest hook (design §4) — INERT until P5. A review/adendum origin (a re-underwrite or
// amendment of an existing facility) must carry a FRESH screening, not inherit a stale attestation from
// the prior cycle. For P3-D this is the simplest faithful predicate: a fresh attestation is required iff
// the origin is review/adendum AND the app is not currently attested. Because originType defaults
// 'original' (the only origin P3-D can create), this returns false for every app today — it activates
// only when P5 introduces review/adendum creation. Do NOT wire this into muapToRiskBlockers in a way
// that changes 'original'-app behaviour (guard so original apps are byte-identical to today).
export const amlReattestRequired = (
  app: Pick<LoanApplication, 'originType' | 'amlAttestation'>,
): boolean => (app.originType === 'review' || app.originType === 'adendum') && !amlAttested(app)
