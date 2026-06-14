// Smoke-test the live Document AI OCR integration WITHOUT the browser/upload flow.
//
// It renders a KTP-like PNG (Playwright) and runs the real `documentai` provider over the bytes,
// printing the OCR'd full text + mean confidence + extracted NIK. Proves credentials + region +
// processor are reachable before you test in the UI. Reads config from apps/web-app/.env.local.
//
// Run:  TSX_TSCONFIG_PATH=apps/web-app/tsconfig.json tsx apps/web-app/scripts/verify-documentai.ts
// (or `pnpm verify:documentai`). Pass a file path to OCR a real doc instead of the rendered KTP:
//   ... verify-documentai.ts /path/to/ktp.jpg
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

// Imported AFTER dotenv so the lazy client sees the env. Direct import (not ../src/server/ocr)
// to skip the `server-only` guard in index.ts.
const { documentAiProvider } = await import('../src/server/ocr/documentai')
import type { LoanApplication } from '../src/lib/types'

const SAMPLE_NIK = '3275010101800001'

async function renderKtpPng(): Promise<Buffer> {
  const html = `<!doctype html><html><body style="margin:0">
    <div style="width:680px;font-family:Arial,sans-serif;padding:24px;border:2px solid #333">
      <div style="font-size:22px;font-weight:bold;text-align:center">PROVINSI DKI JAKARTA</div>
      <div style="font-size:18px;font-weight:bold;text-align:center;margin-bottom:16px">KOTA JAKARTA PUSAT</div>
      <table style="font-size:20px;line-height:1.8">
        <tr><td>NIK</td><td>: <b style="letter-spacing:2px">${SAMPLE_NIK}</b></td></tr>
        <tr><td>Nama</td><td>: BUDI SANTOSO</td></tr>
        <tr><td>Tempat/Tgl Lahir</td><td>: JAKARTA, 01-01-1980</td></tr>
        <tr><td>Jenis Kelamin</td><td>: LAKI-LAKI</td></tr>
        <tr><td>Alamat</td><td>: JL. MAWAR NO. 5, RT 003/RW 004</td></tr>
        <tr><td>Pekerjaan</td><td>: WIRASWASTA</td></tr>
        <tr><td>Kewarganegaraan</td><td>: WNI</td></tr>
      </table>
    </div></body></html>`
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage({ viewport: { width: 728, height: 360 } })
    await page.setContent(html)
    const el = await page.$('div')
    if (!el) throw new Error('Failed to render KTP element')
    return (await el.screenshot({ type: 'png' })) as Buffer
  } finally {
    await browser.close()
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2]
  const { bytes, contentType, source } = arg
    ? { bytes: await readFile(arg), contentType: arg.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', source: arg }
    : { bytes: await renderKtpPng(), contentType: 'image/png', source: `rendered KTP (NIK ${SAMPLE_NIK})` }

  console.log(`Provider: documentai  |  Project: ${process.env.DOCUMENTAI_PROJECT_ID}  |  Location: ${process.env.DOCUMENTAI_LOCATION}`)
  console.log(`Processor: ${process.env.DOCUMENTAI_PROCESSOR_ID}  |  Input: ${source} (${bytes.length} bytes)\n`)

  const provider = documentAiProvider()
  const app = { id: 'verify', nasabahName: 'BUDI SANTOSO', nasabahType: 'individual' } as unknown as LoanApplication

  if (!provider.extractFullText) throw new Error('provider has no extractFullText')
  const text = await provider.extractFullText({ docKind: 'ktp', bytes, contentType, app })
  const nik = await provider.extract({ docKind: 'ktp', bytes, contentType, app })

  console.log('── extractFullText ──────────────────────────')
  console.log(text ?? '(null — check logs above for the failure reason)')
  console.log('\n── extract (KTP → NIK) ──────────────────────')
  console.log(nik ? `${nik.label}: ${nik.value}` : '(null)')
  if (!arg && nik) console.log(nik.value === SAMPLE_NIK ? '✅ NIK matches the rendered sample' : '⚠️  NIK differs from sample')
}

await main()
