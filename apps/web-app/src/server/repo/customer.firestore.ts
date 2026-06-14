import 'server-only'
import { type Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL, appRef } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import { loadApplicationDoc } from './serialize.firestore'
import { resolveCustomerDedup, type CustomerType, type DedupCandidate } from '@/lib/customer-dedup'
import type { LoanApplication } from '@/lib/types'
import type {
  Customer,
  CreateCustomerInput,
  CustomerListRow,
  CustomerDedupMatch,
  PengurusEntry,
  PemegangSahamEntry,
} from './customer.prisma'

// Firestore impl of the customer repo — parity with customer.prisma.ts. findCustomersByIdentity runs
// one query PER identity key and unions by id (Firestore can't OR across different fields).
// applicationCount uses a count() aggregation (no document reads). getCustomerWithApplications uses
// the BARE loader (no checkpoint, no enrichment) to match the Prisma rowToLoanApplication(row) path
// (critique #13) — NOT the enriched getApplication.

type Data = Record<string, unknown>

function docToCustomer(s: DocumentSnapshot): Customer {
  const d = (s.data() ?? {}) as Data
  return {
    id: s.id,
    type: d.type as CustomerType,
    nik: (d.nik as string | null | undefined) ?? null,
    npwp: (d.npwp as string | null | undefined) ?? null,
    nib: (d.nib as string | null | undefined) ?? null,
    alamat: (d.alamat as string | null | undefined) ?? null,
    bidangUsaha: (d.bidangUsaha as string | null | undefined) ?? null,
    nama: (d.nama as string | null | undefined) ?? null,
    namaUsaha: (d.namaUsaha as string | null | undefined) ?? null,
    phoneNumber: (d.phoneNumber as string | null | undefined) ?? null,
    whatsappNumber: (d.whatsappNumber as string | null | undefined) ?? null,
    pengurus: (d.pengurus as PengurusEntry[] | null | undefined) ?? null,
    pemegangSaham: (d.pemegangSaham as PemegangSahamEntry[] | null | undefined) ?? null,
    isMarried: (d.isMarried as boolean | null | undefined) ?? null,
    incomeSource: (d.incomeSource as string | null | undefined) ?? null,
    reviewCadenceMonths: (d.reviewCadenceMonths as number | null | undefined) ?? null,
    extractionExtras: (d.extractionExtras as Record<string, unknown> | null | undefined) ?? null,
    contextMd: (d.contextMd as string | null | undefined) ?? null,
    createdAt: toDate(d.createdAt as Timestamp | undefined) ?? new Date(0),
    createdBy: d.createdBy as string,
    updatedAt: toDate(d.updatedAt as Timestamp | undefined) ?? new Date(0),
  }
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const ref = getDb().collection(COL.customers).doc()
  const now = new Date()
  await ref.set({
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
    pengurus: input.pengurus ?? null,
    pemegangSaham: input.pemegangSaham ?? null,
    isMarried: input.isMarried ?? null,
    incomeSource: input.incomeSource ?? null,
    reviewCadenceMonths: input.reviewCadenceMonths ?? null,
    // extractionExtras omit-when-null asymmetry (critique #1): write only when present.
    ...(input.extractionExtras == null ? {} : { extractionExtras: input.extractionExtras }),
    contextMd: input.contextMd ?? null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  })
  return docToCustomer(await ref.get())
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const s = await getDb().collection(COL.customers).doc(id).get()
  return s.exists ? docToCustomer(s) : null
}

export async function updateCustomerContextMd(id: string, contextMd: string | null): Promise<Customer> {
  const normalised = contextMd?.trim() ? contextMd : null
  const ref = getDb().collection(COL.customers).doc(id)
  await ref.update({ contextMd: normalised, updatedAt: new Date() }) // throws if the id is unknown (parity)
  return docToCustomer(await ref.get())
}

export async function getCustomerForApplication(appId: string): Promise<Customer | null> {
  const appSnap = await appRef(getDb(), appId).get()
  const customerId = appSnap.exists ? ((appSnap.data() as Data).customerId as string | null | undefined) : null
  return customerId ? getCustomer(customerId) : null
}

export async function findCustomersByIdentity(query: {
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
}): Promise<DedupCandidate[]> {
  const keys: Array<'nik' | 'npwp' | 'nib'> = []
  if (query.type === 'individual') {
    if (query.nik) keys.push('nik')
  } else {
    if (query.npwp) keys.push('npwp')
    if (query.nib) keys.push('nib')
  }
  if (keys.length === 0) return []
  const db = getDb()
  const snaps = await Promise.all(
    keys.map((k) =>
      db.collection(COL.customers).where('type', '==', query.type).where(k, '==', query[k]).select('type', 'nik', 'npwp', 'nib').get(),
    ),
  )
  const byId = new Map<string, DedupCandidate>()
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const d = doc.data() as Data
      byId.set(doc.id, {
        id: doc.id,
        type: d.type as CustomerType,
        nik: (d.nik as string | null | undefined) ?? null,
        npwp: (d.npwp as string | null | undefined) ?? null,
        nib: (d.nib as string | null | undefined) ?? null,
      })
    }
  }
  return [...byId.values()]
}

async function countApplications(customerId: string): Promise<number> {
  const agg = await getDb().collection(COL.applications).where('customerId', '==', customerId).count().get()
  return agg.data().count
}

export async function listCustomers(): Promise<CustomerListRow[]> {
  const db = getDb()
  const snap = await db
    .collection(COL.customers)
    .orderBy('updatedAt', 'desc')
    .select('type', 'nama', 'namaUsaha', 'nik', 'npwp', 'nib', 'bidangUsaha', 'phoneNumber', 'updatedAt')
    .get()
  const counts = await Promise.all(snap.docs.map((d) => countApplications(d.id)))
  return snap.docs.map((doc, i) => {
    const d = doc.data() as Data
    return {
      id: doc.id,
      type: d.type as CustomerType,
      nama: (d.nama as string | null | undefined) ?? null,
      namaUsaha: (d.namaUsaha as string | null | undefined) ?? null,
      nik: (d.nik as string | null | undefined) ?? null,
      npwp: (d.npwp as string | null | undefined) ?? null,
      nib: (d.nib as string | null | undefined) ?? null,
      bidangUsaha: (d.bidangUsaha as string | null | undefined) ?? null,
      phoneNumber: (d.phoneNumber as string | null | undefined) ?? null,
      applicationCount: counts[i],
      updatedAt: toDate(d.updatedAt as Timestamp | undefined) ?? new Date(0),
    }
  })
}

export async function getCustomerWithApplications(
  id: string,
): Promise<{ customer: Customer; applications: LoanApplication[] } | null> {
  const db = getDb()
  const cSnap = await db.collection(COL.customers).doc(id).get()
  if (!cSnap.exists) return null
  const appSnap = await db.collection(COL.applications).where('customerId', '==', id).orderBy('createdAt', 'desc').get()
  const loaded = await Promise.all(appSnap.docs.map((d) => loadApplicationDoc(db, d.id))) // BARE loader: no checkpoint/enrich (critique #13)
  return {
    customer: docToCustomer(cSnap),
    applications: loaded.filter((a): a is LoanApplication => a !== null),
  }
}

export async function findCustomerDedupMatches(query: {
  type: CustomerType
  nik?: string | null
  npwp?: string | null
  nib?: string | null
}): Promise<CustomerDedupMatch[]> {
  const candidates = await findCustomersByIdentity(query)
  const { matches } = resolveCustomerDedup(query, candidates)
  if (matches.length === 0) return []
  const db = getDb()
  const ids = matches.map((m) => m.id)
  const [snaps, counts] = await Promise.all([
    db.getAll(...ids.map((id) => db.collection(COL.customers).doc(id))),
    Promise.all(ids.map((id) => countApplications(id))),
  ])
  return snaps.map((s, i) => {
    const d = (s.data() ?? {}) as Data
    return {
      id: s.id,
      type: d.type as CustomerType,
      label: ((d.type === 'individual' ? d.nama : d.namaUsaha) as string | null) || s.id,
      applicationCount: counts[i],
    }
  })
}
