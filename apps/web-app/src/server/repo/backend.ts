import 'server-only'

// Which persistence backend the repo layer uses. Selected by the DATA_BACKEND env var so the
// Prisma and Firestore implementations can coexist behind the repo seam during migration:
//   'prisma'   — Postgres only (today's behavior; the default, so nothing changes until flipped)
//   'firestore'— Firestore only (post-cutover)
//   'dual'     — Prisma authoritative + Firestore shadow-write/read for parity verification (P4)
export type DataBackend = 'prisma' | 'firestore' | 'dual'

export function dataBackend(): DataBackend {
  const v = process.env.DATA_BACKEND
  if (v === 'firestore' || v === 'dual') return v
  return 'prisma'
}

/** Reads served from Firestore? (firestore mode only; dual still reads Prisma authoritatively.) */
export function readsFromFirestore(): boolean {
  return dataBackend() === 'firestore'
}

/** Writes that should reach Firestore? (firestore = sole target; dual = shadow alongside Prisma.) */
export function writesToFirestore(): boolean {
  const b = dataBackend()
  return b === 'firestore' || b === 'dual'
}

/** Writes that should reach Prisma? (prisma + dual; firestore mode stops writing Postgres.) */
export function writesToPrisma(): boolean {
  const b = dataBackend()
  return b === 'prisma' || b === 'dual'
}
