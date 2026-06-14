import 'server-only'

import { buildRequiredDocuments } from '@/lib/required-docs'
import { createApplication } from '@/server/repo/write'
import { countApplications } from '@/server/repo/applications'
import { createCustomer, findCustomersByIdentity, getCustomer } from '@/server/repo/customer'
import { resolveCustomerDedup } from '@/lib/customer-dedup'
import { auditUserName, type Actor } from '@/lib/auth/can'
import type { AkadType, CollateralType, ExtractionSource, FinancingPurpose, IncomeSource, LoanApplication } from '@/lib/types'

// Actor-injected core of createApplicationAction. Kept OUT of the 'use server' module so the
// actor-trusting entry point is NOT registered as a public server action (an Actor passed over
// the wire would be client-forgeable); the 'use server' wrapper resolves + gates the actor, then
// calls this. server-only (never bundled to the client).

export interface CreateAppInput {
  nasabahName: string
  nasabahType: 'individual' | 'business'
  phoneNumber: string
  whatsappNumber?: string
  namaUsaha?: string
  // Legal-identity fields, optionally captured at intake (else OCR-suggested + confirmed later).
  nik?: string
  npwp?: string
  nib?: string
  alamat?: string
  bidangUsaha?: string
  akadType: AkadType
  collateralType: CollateralType
  incomeSource?: IncomeSource
  isMarried?: boolean
  requestedPlafond: number
  requestedTenorMonths: number
  purpose: string
  // Optional structured purpose dimension driving purpose-conditioned required docs (SOP slide 5).
  // The intake form does not capture this yet (W1) — undefined keeps today's checklist.
  financingPurpose?: FinancingPurpose
  // Link-direct path (ADR-0020 §2, limitation #2): when "Buat Pengajuan" launches from an existing
  // Nasabah file, the exact Customer id is passed so the new Application links THAT customer — even
  // when the identity key (NIK/NPWP/NIB) is blank at intake — instead of dedup forking a duplicate.
  customerId?: string
  // P5 (RM-led redesign §7 / Topic 7): a review/adendum CHILD app reuses the FULL pipeline. originType
  // tags it (Bank-initiated review · Nasabah-initiated adendum); sourceApplicationId is the lineage
  // parent (the prior cycle's app id). Absent → an 'original' root app (today's behaviour, byte-identical).
  // The child STILL starts amlAttestation=null (the create literal nulls it) → a fresh AML attest is
  // required (muapToRiskBlockers gates on !amlAttested) — do NOT copy the parent's attestation.
  originType?: 'review' | 'adendum'
  sourceApplicationId?: string
}

/// Actor-injected core of createApplicationAction. ADR-0020 §2 customer-first + dual-write:
/// resolve OR create the first-class Customer entity from the intake identity, link the new
/// Application to it (customerId), then persist the Application (the dual-read source still
/// carries the identity columns unchanged). A repeat NIK (individual) / NPWP|NIB (business)
/// REUSES the existing Customer (no duplicate) — the same identity key the soft-nudge resolver
/// uses. NOT a 'use server' export (no own authz): callers MUST gate (the action asserts 'intake').
export async function createApplicationForActor(actor: Actor, input: CreateAppInput): Promise<LoanApplication> {
  // Legal-identity captured manually at intake is human-entered (blessed): a later OCR re-read that
  // differs becomes a recorded mismatch, never a silent overwrite. npwp/alamat for any nasabah;
  // nib/bidangUsaha business-only.
  const isBusiness = input.nasabahType === 'business'
  const identity: { nik?: string; npwp?: string; nib?: string; alamat?: string; bidangUsaha?: string } = {}
  if (!isBusiness && input.nik?.trim()) identity.nik = input.nik.trim()
  if (input.npwp?.trim()) identity.npwp = input.npwp.trim()
  if (input.alamat?.trim()) identity.alamat = input.alamat.trim()
  if (isBusiness && input.nib?.trim()) identity.nib = input.nib.trim()
  if (isBusiness && input.bidangUsaha?.trim()) identity.bidangUsaha = input.bidangUsaha.trim()
  const identitySources = Object.fromEntries(Object.keys(identity).map((k) => [k, 'human_entered' as ExtractionSource]))

  // Customer-first (ADR-0020 §2): link the first-class Customer.
  // Link-direct path (limitation #2): when an explicit input.customerId is supplied (the
  // "Buat Pengajuan" CTA launched from an existing Nasabah file), use it DIRECTLY — skipping the
  // dedup resolver — so the app links THAT customer even with a blank/differing intake identity key,
  // never forking a duplicate. Verify it exists first; fall back to resolveOrCreateCustomer
  // defensively if the id is stale/unknown. Otherwise resolve OR create via the dedup key
  // (individual→NIK, business→NPWP, NIB secondary) — a repeat reuses the existing Customer.
  let customerId: string
  if (input.customerId) {
    const existing = await getCustomer(input.customerId)
    customerId = existing ? existing.id : await resolveOrCreateCustomer(actor.userId, input, identity)
  } else {
    customerId = await resolveOrCreateCustomer(actor.userId, input, identity)
  }

  // The display id is `FOS-2026-NNN` derived from the row count. That read-then-write is NOT atomic:
  // two concurrent creates can compute the same NNN and collide on the id PK (a P2002). We retry on
  // that collision with a freshly-recomputed id (offset by the attempt to skip a busy slot) — this
  // makes concurrent "Buat Aplikasi" safe in production and de-flakes the parallel itest workers.
  // Customer resolution above is done ONCE and stays outside the loop; only id/now/aggregate rebuild.
  for (let attempt = 0; ; attempt++) {
    const count = await countApplications()
    const id = `FOS-2026-${String(count + 1 + attempt).padStart(3, '0')}`
    const now = new Date()

    const app: LoanApplication = {
      id,
      nasabahName: input.nasabahName.trim(),
      nasabahType: input.nasabahType,
      phoneNumber: input.phoneNumber.trim(),
      ...(input.whatsappNumber?.trim() ? { whatsappNumber: input.whatsappNumber.trim() } : {}),
      akadType: input.akadType,
      collateralType: input.collateralType,
      ...(input.nasabahType === 'individual' ? { incomeSource: input.incomeSource, isMarried: input.isMarried } : {}),
      ...(input.nasabahType === 'business' ? { namaUsaha: input.namaUsaha?.trim() } : {}),
      ...identity,
      ...(Object.keys(identitySources).length ? { extractionSources: identitySources } : {}),
      requestedPlafond: input.requestedPlafond,
      requestedTenorMonths: input.requestedTenorMonths,
      purpose: input.purpose.trim(),
      // P5 (RM-led redesign §7): a review/adendum child tags originType + the lineage parent. An absent
      // originType = an 'original' root (default applied by consumers; we pass it through unchanged).
      // amlAttestation stays null below for ALL origins — a review/adendum child must re-attest fresh.
      originType: input.originType ?? 'original',
      ...(input.sourceApplicationId ? { sourceApplicationId: input.sourceApplicationId } : {}),
      stage: 1,
      // RM desk (create is RM-gated; the intake desk carries role RM).
      assignments: [
        { stage: 1, role: 'RM', userId: actor.userId, userName: actor.name, status: 'in_progress', assignedAt: now, submittedAt: null },
      ],
      enteredStageAt: now,
      createdAt: now,
      createdBy: actor.userId,
      hardGates: { dsr: 0, ltv: 0, kol: 1 },
      hardGateViolations: [],
      kolEntered: false,
      financialsAssessed: false,
      stage2LegalApproval: null,
      stage2SlikApproval: null,
      amlAttestation: null,
      financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 },
      marginRate: null,
      documents: buildRequiredDocuments(
        {
          nasabahType: input.nasabahType,
          akadType: input.akadType,
          isMarried: input.nasabahType === 'individual' ? input.isMarried : undefined,
          incomeSource: input.nasabahType === 'individual' ? input.incomeSource : undefined,
          collateralType: input.collateralType,
          financingPurpose: input.financingPurpose,
        },
        id,
      ),
      history: [
        { id: `h-0000001-${id}`, timestamp: now, userId: actor.userId, userName: auditUserName(actor), action: 'Aplikasi pembiayaan dibuat', stage: 1 },
      ],
      analysis: { character: '', capacity: '', capital: '', condition: '', collateral: '', syariah: '', generated: false },
      riskRecommendation: null,
      komiteVotes: [],
      aiChatHistory: [],
      aiAssistantLog: [],
    }

    try {
      return await createApplication(app, { customerId })
    } catch (e) {
      // Retry ONLY the id-PK collision from the concurrent count race; rethrow anything else.
      // Bounded so a genuine persistent failure can't spin forever.
      if (isDuplicateApplicationId(e) && attempt < 24) continue
      throw e
    }
  }
}

/** True for a Prisma unique-constraint violation (P2002) — the only such hit during app create is the
 *  `FOS-2026-NNN` id PK colliding with a concurrent create; retrying regenerates a fresh id. */
function isDuplicateApplicationId(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
}

/// Resolve an existing Customer for this identity (dedup nudge key) or create a fresh one,
/// returning its id for the Application link. Individual identity = NIK; business = NPWP, NIB
/// secondary. The Customer carries the SAME identity the Application's dual-read columns do
/// (nik/npwp/nib/alamat/bidangUsaha; nama for individual / namaUsaha for business; phone;
/// isMarried/incomeSource for individuals) — parity at create time.
async function resolveOrCreateCustomer(
  createdBy: string,
  input: CreateAppInput,
  identity: { nik?: string; npwp?: string; nib?: string; alamat?: string; bidangUsaha?: string },
): Promise<string> {
  const type = input.nasabahType
  const candidates = await findCustomersByIdentity({ type, nik: identity.nik, npwp: identity.npwp, nib: identity.nib })
  const { matches } = resolveCustomerDedup({ type, nik: identity.nik, npwp: identity.npwp, nib: identity.nib }, candidates)
  if (matches.length > 0) return matches[0].id

  const isBusiness = type === 'business'
  const customer = await createCustomer({
    type,
    nik: identity.nik ?? null,
    npwp: identity.npwp ?? null,
    nib: identity.nib ?? null,
    alamat: identity.alamat ?? null,
    bidangUsaha: identity.bidangUsaha ?? null,
    nama: isBusiness ? null : input.nasabahName.trim(),
    namaUsaha: isBusiness ? (input.namaUsaha?.trim() ?? input.nasabahName.trim()) : null,
    phoneNumber: input.phoneNumber.trim(),
    whatsappNumber: input.whatsappNumber?.trim() ?? null,
    isMarried: isBusiness ? null : (input.isMarried ?? null),
    incomeSource: isBusiness ? null : (input.incomeSource ?? null),
    createdBy,
  })
  return customer.id
}
