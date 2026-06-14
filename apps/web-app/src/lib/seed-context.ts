import type { AkadType, CollateralType, LoanApplication } from './types'

export interface SeedContext {
  applicationId: string
  nasabahName: string
  nasabahType: 'individual' | 'business'
  namaUsaha?: string
  // Legal-identity fields (OCR-suggested + human-confirmed) that fill MUAP IDENTITAS HUKUM slots.
  npwp?: string
  nib?: string
  alamat?: string
  bidangUsaha?: string
  akadType: AkadType
  requestedPlafond: number
  requestedTenorMonths: number
  purpose: string
  marginRate: number | null
  nisbahBankPercent?: number | null
  nisbahCustomerPercent?: number | null
  collateralType?: CollateralType
  hardGates: { dsr: number; ltv: number; kol: number }
  hardGateViolations: string[]
  financialInputs: {
    netMonthlyIncome: number
    existingMonthlyObligations: number
    collateralAppraisedValue: number
    proposedMonthlyInstallment: number | null
    projectedMonthlyProfitShare: number | null
    nisbahBankPercent?: number | null
    nisbahCustomerPercent?: number | null
    projectionBasis?: string
  }
  // Optional prior analyst narrative — passed to the AI ONLY as reference context.
  analysis?: {
    character: string; capacity: string; capital: string
    condition: string; collateral: string; syariah: string
  }
  // Optional full-document OCR text (Slice 2) — passed to the AI ONLY as reference
  // grounding. Masked at the egress boundary (narrative.ts); never authoritative.
  documentTexts?: { label: string; text: string }[]
  // Cited web-research claims (workflow-finetune.md §7). URLs are preserved so the narrative
  // can reference them. Already business-only via the egress classifier; still mask-in/out.
  exploredSources?: { url: string; title: string; claim: string }[]
  // Batch 5 (#2): RM's bureau-data summary (SLIK/Pefindo narrative). Previously NOT fed to the
  // drafter — a real context gap. Reference grounding only; masked at egress; never authoritative.
  bureauSummary?: string
}

export function buildSeedContext(app: LoanApplication): SeedContext {
  return {
    applicationId: app.id,
    nasabahName: app.nasabahName,
    nasabahType: app.nasabahType,
    namaUsaha: app.namaUsaha,
    npwp: app.npwp,
    nib: app.nib,
    alamat: app.alamat,
    bidangUsaha: app.bidangUsaha,
    akadType: app.akadType,
    requestedPlafond: app.requestedPlafond,
    requestedTenorMonths: app.requestedTenorMonths,
    purpose: app.purpose,
    marginRate: app.marginRate,
    nisbahBankPercent: app.financialInputs.nisbahBankPercent,
    nisbahCustomerPercent: app.financialInputs.nisbahCustomerPercent,
    collateralType: app.collateralType,
    hardGates: app.hardGates,
    hardGateViolations: app.hardGateViolations,
    financialInputs: {
      netMonthlyIncome: app.financialInputs.netMonthlyIncome,
      existingMonthlyObligations: app.financialInputs.existingMonthlyObligations,
      collateralAppraisedValue: app.financialInputs.collateralAppraisedValue,
      proposedMonthlyInstallment: app.financialInputs.proposedMonthlyInstallment,
      projectedMonthlyProfitShare: app.financialInputs.projectedMonthlyProfitShare,
      nisbahBankPercent: app.financialInputs.nisbahBankPercent,
      nisbahCustomerPercent: app.financialInputs.nisbahCustomerPercent,
      projectionBasis: app.financialInputs.projectionBasis,
    },
    analysis: {
      character: app.analysis.character,
      capacity: app.analysis.capacity,
      capital: app.analysis.capital,
      condition: app.analysis.condition,
      collateral: app.analysis.collateral,
      syariah: app.analysis.syariah,
    },
    documentTexts: app.documents.flatMap((d) =>
      d.extractedText ? [{ label: d.name, text: d.extractedText }] : [],
    ),
    exploredSources: app.exploredSources?.map((s) => ({ url: s.url, title: s.title, claim: s.claim })) ?? undefined,
    bureauSummary: app.bureauSummary?.summary || undefined,
  }
}
