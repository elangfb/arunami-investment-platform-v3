/**
 * Exercise the per-application Docs flow without the HTTP layer:
 * create per-app Docs (copy masters) → extract+persist → read back.
 *
 * Run:  pnpm exec tsx apps/web-app/scripts/demo-app-docs.ts [APP_ID]
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

const { createApplicationDocs, syncApplicationDocs, getApplicationDocs } = await import('../src/server/docs/service')

async function main() {
  const appId = process.argv[2] ?? 'DEMO-001'

  const linkage = await createApplicationDocs(appId, { nasabahName: 'PT Demo Sejahtera' })
  console.log('linkage:', linkage)
  console.log('  MUAP:', `https://docs.google.com/document/d/${linkage.muapDocId}/edit`)
  console.log('  RSK :', `https://docs.google.com/document/d/${linkage.rskDocId}/edit`)

  const { report } = await syncApplicationDocs(appId)
  console.log(`\nextract run ${report.runId} — ok=${report.ok}`)

  const state = await getApplicationDocs(appId)
  console.log('\nlatest OK snapshot matrix:')
  for (const m of state.snapshot?.matrix ?? []) console.log(`  ${m.aspect.padEnd(20)} ${m.level ?? '—'}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
