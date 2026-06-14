/**
 * SeaweedFS S3 round-trip spike — proves the storage integration before any app
 * code depends on it: create bucket → put random bytes → get them back → assert
 * the bytes + SHA-256 match.
 *
 * Run from apps/web-app:
 *   set -a; . .env.local; set +a; pnpm exec tsx scripts/spike-s3.ts
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { ensureBucket, putDocument, getDocument, sha256 } = await import('../src/server/storage/s3')

async function main() {
  await ensureBucket()
  const key = `spike/${Date.now()}-roundtrip.bin`
  const original = randomBytes(64 * 1024) // 64 KB, like a small scanned doc

  const put = await putDocument(key, original, 'application/octet-stream')
  const fetched = await getDocument(key)
  const getSha = sha256(fetched)
  const ok = getSha === put.sha256 && fetched.length === put.size

  console.log({
    key,
    size: put.size,
    putSha256: put.sha256,
    getSha256: getSha,
    bytesMatch: fetched.equals(original),
    roundTripOK: ok,
  })
  if (!ok) {
    console.error('❌ round-trip MISMATCH')
    process.exit(1)
  }
  console.log('✅ SeaweedFS S3 round-trip OK — bytes + SHA-256 intact')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
