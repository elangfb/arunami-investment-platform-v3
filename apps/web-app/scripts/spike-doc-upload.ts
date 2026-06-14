/**
 * Integration spike for Tier 0.1 document storage — proves the full upload→persist→
 * retrieve path the server action + retrieval route rely on, WITHOUT a running server:
 *   storeDocumentFile(File) → object store + integrity facts
 *   → ApplicationDocument row (new storageKey/sha256/sizeBytes/contentType columns)
 *   → reload row → getDocument(storageKey) → assert bytes + SHA-256 + size match.
 * Uses prisma directly (the repo wrappers import `server-only`, which throws under tsx);
 * the repo's create/serialize mapping of these same fields is covered by `pnpm typecheck`.
 * Cleans up its test row + leaves only the spike object in storage.
 *
 * Run from apps/web-app:
 *   set -a; . .env.local; set +a; pnpm exec tsx scripts/spike-doc-upload.ts
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

const { prisma } = await import('../src/server/db')
const { storeDocumentFile, getDocument } = await import('../src/server/storage/documents')

async function main() {
  const app = await prisma.application.findFirst({ select: { id: true } })
  if (!app) throw new Error('No seeded application to attach a spike document to.')

  const docId = `${app.id}-spike-${Date.now()}`
  const bytes = Buffer.from('%PDF-1.4 mizan upload spike ' + 'x'.repeat(4096))
  const file = new File([bytes], 'spike-ktp.pdf', { type: 'application/pdf' })

  // 1) store the bytes exactly like the upload action does
  const stored = await storeDocumentFile(app.id, docId, file)

  // 2) persist the integrity facts onto a real ApplicationDocument row (new columns)
  await prisma.applicationDocument.create({
    data: {
      id: docId,
      applicationId: app.id,
      name: 'Spike KTP',
      docType: 'spike',
      status: 'uploaded',
      required: false,
      uploadedAt: new Date(),
      uploadedBy: 'spike',
      fileName: stored.fileName,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      sizeBytes: stored.sizeBytes,
      contentType: stored.contentType,
    },
  })

  // 3) reload + retrieve like the proxy route does
  const row = await prisma.applicationDocument.findUnique({ where: { id: docId } })
  if (!row?.storageKey) throw new Error('Spike row missing or has no storageKey')
  const fetched = await getDocument(row.storageKey)
  const ok =
    fetched.equals(bytes) &&
    row?.sha256 === stored.sha256 &&
    row?.sizeBytes === bytes.length &&
    row?.contentType === 'application/pdf'

  console.log({
    appId: app.id,
    docId,
    storageKey: row?.storageKey,
    sha256: row?.sha256,
    sizeBytes: row?.sizeBytes,
    contentType: row?.contentType,
    bytesMatch: fetched.equals(bytes),
    ok,
  })

  // cleanup the DB row (storage object is harmless; left for manual inspection)
  await prisma.applicationDocument.delete({ where: { id: docId } })
  await prisma.$disconnect()

  if (!ok) {
    console.error('❌ document upload integration FAILED')
    process.exit(1)
  }
  console.log('✅ upload→DB→retrieve OK — bytes + SHA-256 + size + content-type persisted')
}

main().catch(async (e) => {
  console.error(e)
  process.exit(1)
})
