/**
 * Smoke-test the real Gemini call (key + model) without the Next server.
 * Run:  pnpm exec tsx apps/web-app/scripts/ai-smoke.ts
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

const { generateReply, aiModel } = await import('../src/server/ai/gemini')
const { systemInstruction, buildPrompt } = await import('../src/server/ai/context')

async function main() {
  const ctx = {
    nasabahName: 'PT Sinar Rezeki',
    nasabahType: 'business',
    akadType: 'Murabahah',
    requestedPlafond: 900000000,
    requestedTenorMonths: 36,
    purpose: 'Modal kerja pengadaan stok barang',
    stage: 3,
    hardGates: { dsr: 32, ltv: 58, kol: 1 },
    hardGateViolations: [],
    missingDocs: [],
  }
  const snapshot = {
    matrix: [
      { aspect: 'collateral' as const, level: 'high' as const, finding: 'Aset a.n. pihak ketiga', mitigation: 'Balik nama' },
      { aspect: 'capacity' as const, level: 'medium' as const, finding: 'Pendapatan tumbuh', mitigation: 'Monitoring' },
    ],
    ratios: [{ key: 'dscri' as const, points: [{ period: '2024', value: 1.2, raw: '1,2x' }], sourceDoc: 'muap' as const }],
    collateral: { marketValue: 1550000000, liquidationValue: 1100000000, sccrPercent: 122 },
    racDeviations: [{ item: 'SCCR awal di bawah 100%', justification: 'Disesuaikan plafond' }],
  }
  console.log('model:', aiModel())
  const reply = await generateReply(await systemInstruction(), buildPrompt(ctx, snapshot, 'Ringkas risiko utama dan rekomendasi.'))
  console.log('\n--- REPLY ---\n' + reply)
}

main().catch((e) => {
  console.error('AI smoke failed:', (e as Error).message)
  process.exit(1)
})
