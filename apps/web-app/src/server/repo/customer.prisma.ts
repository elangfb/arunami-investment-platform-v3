import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { resolveCustomerDedup, type CustomerType, type DedupCandidate } from '@/lib/customer-dedup'
import { rowToLoanApplication, APPLICATION_INCLUDE } from '@/server/repo/serialize'
import type { LoanApplication } from '@/lib/types'

// Customer repo (ADR-0020 §2 / design Topic 2). Create + read of the first-class Customer entity.
// ADDITIVE + DUAL-READ contract: Application keeps its identity columns and stays the read source;
// this repo only manages the Customer rows that writers will later mirror into. No reader changes here.
//
// Storage mirrors the schema convention: real columns for QUERIED identity (nik/npwp/nib/alamat/
// bidangUsaha) + Zod-validated JSON aggregates read as a unit, never filtered by sub-field
// (pengurus[]/pemegangSaham[]) — same shape as hardGates/financialInputs on Application.

// JSON cast at the write boundary (named interfaces lack Prisma's implicit index signature).
const json = (v: unknown) => v as Prisma.InputJsonValue
const jsonOrNull = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue))

/** One person in the company file (pengurus / komisaris). Read as a unit, never queried by field. */
export interface PengurusEntry {
  nama: string
  nik?: string
  jabatan?: string
  [k: string]: unknown
}

/** One shareholder in the company file. */
export interface PemegangSahamEntry {
  nama: string
  nik?: string
  persentase?: number
  [k: string]: unknown
}

/** The domain shape the repo reads/writes. Mirrors the Prisma Customer model. */
export interface Customer {
  id: string
  type: CustomerType
  // Queried identity
  nik?: string | null
  npwp?: string | null
  nib?: string | null
  alamat?: string | null
  bidangUsaha?: string | null
  nama?: string | null
  namaUsaha?: string | null
  // Contact
  phoneNumber?: string | null
  whatsappNumber?: string | null
  // JSON aggregates (read as a unit)
  pengurus?: PengurusEntry[] | null
  pemegangSaham?: PemegangSahamEntry[] | null
  // Individual extras
  isMarried?: boolean | null
  incomeSource?: string | null
  // P5 (RM-led redesign §7 / Topic 7): the Nasabah-level review-cadence OVERRIDE in months. Cascade is
  // `reviewCadenceMonths ?? CADENCE_DEFAULT_MONTHS(12)` (facility override DEFERRED, C7). Null = default.
  reviewCadenceMonths?: number | null
  extractionExtras?: Record<string, unknown> | null
  // Topic-5 AI context (filled in P4 — present for round-trip completeness)
  contextMd?: string | null
  createdAt: Date
  createdBy: string
  updatedAt: Date
}

/** Fields accepted on create (id/timestamps are server-assigned). */
export interface CreateCustomerInput {
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
  alamat?: string | null
  bidangUsaha?: string | null
  nama?: string | null
  namaUsaha?: string | null
  phoneNumber?: string | null
  whatsappNumber?: string | null
  pengurus?: PengurusEntry[] | null
  pemegangSaham?: PemegangSahamEntry[] | null
  isMarried?: boolean | null
  incomeSource?: string | null
  reviewCadenceMonths?: number | null
  extractionExtras?: Record<string, unknown> | null
  contextMd?: string | null
  createdBy: string
}

// The single read boundary for a Customer row → domain shape. JSON aggregates come back as
// `unknown` → cast to the domain types (matching serialize.ts rowToLoanApplication).
type CustomerRow = Prisma.CustomerGetPayload<Record<string, never>>

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    type: row.type as CustomerType,
    nik: row.nik,
    npwp: row.npwp,
    nib: row.nib,
    alamat: row.alamat,
    bidangUsaha: row.bidangUsaha,
    nama: row.nama,
    namaUsaha: row.namaUsaha,
    phoneNumber: row.phoneNumber,
    whatsappNumber: row.whatsappNumber,
    pengurus: (row.pengurus as PengurusEntry[] | null) ?? null,
    pemegangSaham: (row.pemegangSaham as PemegangSahamEntry[] | null) ?? null,
    isMarried: row.isMarried,
    incomeSource: row.incomeSource,
    reviewCadenceMonths: row.reviewCadenceMonths,
    extractionExtras: (row.extractionExtras as Record<string, unknown> | null) ?? null,
    contextMd: row.contextMd,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
  }
}

/** Persist a new Customer; returns the freshly-read domain aggregate. */
export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const row = await prisma.customer.create({
    data: {
      type: input.type,
      nik: input.nik ?? null,
      npwp: input.npwp ?? null,
      nib: input.nib ?? null,
      alamat: input.alamat ?? null,
      bidangUsaha: input.bidangUsaha ?? null,
      nama: input.nama ?? null,
      namaUsaha: input.namaUsaha ?? null,
      phoneNumber: input.phoneNumber ?? null,
      whatsappNumber: input.whatsappNumber ?? null,
      pengurus: jsonOrNull(input.pengurus),
      pemegangSaham: jsonOrNull(input.pemegangSaham),
      isMarried: input.isMarried ?? null,
      incomeSource: input.incomeSource ?? null,
      reviewCadenceMonths: input.reviewCadenceMonths ?? null,
      extractionExtras: input.extractionExtras == null ? undefined : json(input.extractionExtras),
      contextMd: input.contextMd ?? null,
      createdBy: input.createdBy,
    },
  })
  return rowToCustomer(row)
}

/** Read a single Customer by id, or null. */
export async function getCustomer(id: string): Promise<Customer | null> {
  const row = await prisma.customer.findUnique({ where: { id } })
  return row ? rowToCustomer(row) : null
}

/**
 * Persist the customer-scoped human "Catatan" (Customer.contextMd — the sacred, free-text AI-context
 * note; layered AI context, RM-led redesign §5 / Topic 5). This is the ONLY mutation of contextMd —
 * the AUTO derived block is built live at injection and never stored here. A blank/whitespace note is
 * normalised to NULL (an empty layer is omitted by the cascade renderer). Returns the fresh aggregate;
 * throws if the customer id is unknown (the caller resolves the row first). The actor gate + audit
 * attribution live in the server action (server/actions/ai-context.core.ts).
 */
export async function updateCustomerContextMd(id: string, contextMd: string | null): Promise<Customer> {
  const normalised = contextMd?.trim() ? contextMd : null
  const row = await prisma.customer.update({ where: { id }, data: { contextMd: normalised } })
  return rowToCustomer(row)
}

/** The Customer linked to an Application (via the additive FK), or null when unlinked (pre-migration
 *  rows / standalone apps). Used by the advisory OCR cross-checks (Akta-vs-Customer roster, identity-
 *  vs-customer-master) — those are ADVISORY annotations only, never blockers. */
export async function getCustomerForApplication(appId: string): Promise<Customer | null> {
  const row = await prisma.application.findUnique({ where: { id: appId }, select: { customerId: true } })
  if (!row?.customerId) return null
  return getCustomer(row.customerId)
}

/** Identity query for the create-time dedup nudge (ADR-0020 §2). Returns DedupCandidate rows
 *  (id + identity fields only) for resolveCustomerDedup — the pure resolver decides the match.
 *  Queries by the candidate keys for the given type so the index is used; the resolver still
 *  re-checks with trimmed-string equality (defensive against stored whitespace). */
export async function findCustomersByIdentity(query: {
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
}): Promise<DedupCandidate[]> {
  const or: Prisma.CustomerWhereInput[] = []
  if (query.type === 'individual') {
    if (query.nik) or.push({ nik: query.nik })
  } else {
    if (query.npwp) or.push({ npwp: query.npwp })
    if (query.nib) or.push({ nib: query.nib })
  }
  if (or.length === 0) return []

  const rows = await prisma.customer.findMany({
    where: { type: query.type, OR: or },
    select: { id: true, type: true, nik: true, npwp: true, nib: true },
  })
  return rows.map((r) => ({
    id: r.id,
    type: r.type as CustomerType,
    nik: r.nik,
    npwp: r.npwp,
    nib: r.nib,
  }))
}

/** A lightweight Customer row for the Nasabah list view (P1, ADR-0020 §2 customer-first entry). */
export interface CustomerListRow {
  id: string
  type: CustomerType
  nama: string | null
  namaUsaha: string | null
  nik: string | null
  npwp: string | null
  nib: string | null
  bidangUsaha: string | null
  phoneNumber: string | null
  applicationCount: number
  updatedAt: Date
}

/** List every Customer as a lightweight list row, newest-touched first. applicationCount comes from
 *  ONE grouped count of Application rows by customerId (not N+1), joined in memory. */
export async function listCustomers(): Promise<CustomerListRow[]> {
  const [rows, counts] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        type: true,
        nama: true,
        namaUsaha: true,
        nik: true,
        npwp: true,
        nib: true,
        bidangUsaha: true,
        phoneNumber: true,
        updatedAt: true,
      },
    }),
    prisma.application.groupBy({ by: ['customerId'], _count: true }),
  ])
  const countByCustomer = new Map<string, number>()
  for (const c of counts) {
    if (c.customerId) countByCustomer.set(c.customerId, c._count)
  }
  return rows.map((r) => ({
    id: r.id,
    type: r.type as CustomerType,
    nama: r.nama,
    namaUsaha: r.namaUsaha,
    nik: r.nik,
    npwp: r.npwp,
    nib: r.nib,
    bidangUsaha: r.bidangUsaha,
    phoneNumber: r.phoneNumber,
    applicationCount: countByCustomer.get(r.id) ?? 0,
    updatedAt: r.updatedAt,
  }))
}

/** Load a single Customer plus all its Applications (newest-first) for the Nasabah file view, or
 *  null. Applications go through the SAME row→domain serializer the application loaders use
 *  (rowToLoanApplication) — never hand-mapped — so the aggregate shape stays in lockstep. */
export async function getCustomerWithApplications(
  id: string,
): Promise<{ customer: Customer; applications: LoanApplication[] } | null> {
  const row = await prisma.customer.findUnique({ where: { id } })
  if (!row) return null
  const appRows = await prisma.application.findMany({
    where: { customerId: id },
    include: APPLICATION_INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return {
    customer: rowToCustomer(row),
    applications: appRows.map((r) => rowToLoanApplication(r)),
  }
}

/** One enriched dedup match for the create-time soft nudge (label + applicationCount). */
export interface CustomerDedupMatch {
  id: string
  type: CustomerType
  label: string
  applicationCount: number
}

/** Thin enriched wrapper over the dedup resolver for the create-time nudge. Reuses the existing
 *  findCustomersByIdentity + resolveCustomerDedup (no new identity logic — NIK/NPWP compare as
 *  trimmed strings there), then decorates each match with a display label + its applicationCount. */
export async function findCustomerDedupMatches(query: {
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
}): Promise<CustomerDedupMatch[]> {
  const candidates = await findCustomersByIdentity(query)
  const { matches } = resolveCustomerDedup(query, candidates)
  if (matches.length === 0) return []

  const ids = matches.map((m) => m.id)
  const [rows, counts] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true, nama: true, namaUsaha: true },
    }),
    prisma.application.groupBy({ by: ['customerId'], where: { customerId: { in: ids } }, _count: true }),
  ])
  const countByCustomer = new Map<string, number>()
  for (const c of counts) {
    if (c.customerId) countByCustomer.set(c.customerId, c._count)
  }
  return rows.map((r) => ({
    id: r.id,
    type: r.type as CustomerType,
    label: (r.type === 'individual' ? r.nama : r.namaUsaha) || r.id,
    applicationCount: countByCustomer.get(r.id) ?? 0,
  }))
}
