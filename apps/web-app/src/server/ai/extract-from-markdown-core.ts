import { z } from 'zod'
import { unmaskPii } from '@/lib/pii-mask'
import type { PiiSecret } from '@/lib/pii-mask'
import type { ExtractedSnapshot, ExtractionReport, FieldReport } from '@/lib/extraction/types'
import type { LoanApplication } from '@/lib/types'

// ── Document read-back: Markdown → AI — PURE CORE (document-readback-markdown-ai.md) ───────────
//
// The schema + prompt + unmask transform for the structured read-back, kept free of prisma /
// provider / `server-only` (mirrors redact.ts) so it stays hermetically unit-testable. The egress
// + audit shell lives in extract-from-markdown.ts. Output shape is the SAME ExtractedSnapshot the
// NamedRange/sentinel adapter produced, so every consumer (scoresFromSnapshot, ExtractionPreview,
// the AI snapshotBlock context) is untouched.

// Zod schema mirroring ExtractedSnapshot exactly. The `z.ZodType<ExtractedSnapshot>` annotation is a
// compile-time guard: the schema must stay shape-identical to the type the consumers expect.
export const SnapshotSchema: z.ZodType<ExtractedSnapshot> = z.object({
  matrix: z.array(
    z.object({
      aspect: z.enum([
        'character',
        'capacity',
        'capital',
        'collateral',
        'condition',
        'sharia_compliance',
        'sharia_structuring',
      ]),
      level: z.enum(['low', 'medium', 'high']).nullable(),
      finding: z.string(),
      mitigation: z.string(),
    }),
  ),
  ratios: z.array(
    z.object({
      key: z.enum(['dscri', 'der', 'currentRatio', 'gpm', 'npm']),
      points: z.array(
        z.object({
          period: z.string(),
          value: z.number().nullable(),
          raw: z.string(),
        }),
      ),
      sourceDoc: z.enum(['muap', 'rsk']).nullable(),
    }),
  ),
  collateral: z.object({
    marketValue: z.number().nullable(),
    liquidationValue: z.number().nullable(),
    sccrPercent: z.number().nullable(),
  }),
  racDeviations: z.array(z.object({ item: z.string(), justification: z.string() })),
})

export const EXTRACT_SYSTEM_INSTRUCTION = [
  'Anda adalah mesin ekstraksi terstruktur untuk dokumen kredit syariah Mizan (MUAP & RSK).',
  'Tugas: BACA dokumen Markdown yang diberikan dan keluarkan snapshot terstruktur SESUAI SKEMA.',
  'ATURAN:',
  '- Hanya laporkan apa yang TERTULIS di dokumen. JANGAN mengarang nilai, level, atau temuan.',
  '- `level` matriks risiko HANYA dari yang ditulis analis: low/medium/high (Rendah/Sedang/Tinggi).',
  '  Jika sel kosong atau tidak dapat dibaca, kembalikan null — JANGAN menebak.',
  '- Rasio keuangan: kembalikan angka ternormalisasi (persen sebagai angka, "1,2x" → 1.2); sel kosong → value null, raw apa adanya.',
  '- Agunan & deviasi RAC: kembalikan apa adanya; nilai uang sebagai angka, kosong → null.',
  '- JANGAN menyatakan keputusan/rekomendasi (approve/reject) atau kesimpulan kelayakan — itu wewenang manusia.',
].join('\n')

export function buildExtractPrompt(muapMarkdown: string | null, rskMarkdown: string | null): string {
  const parts: string[] = []
  if (rskMarkdown) parts.push('═══ DOKUMEN RSK (matriks risiko 5C+2S, deviasi RAC) ═══', rskMarkdown)
  if (muapMarkdown) parts.push('', '═══ DOKUMEN MUAP (rasio keuangan, agunan) ═══', muapMarkdown)
  parts.push('', 'Keluarkan snapshot terstruktur sesuai skema.')
  return parts.join('\n')
}

// Unmask the model's free-text fields (it only ever saw masked text, so any name it echoed is a
// placeholder we restore to the analyst's real authoring for the persisted snapshot). Numeric/raw
// fields pass through unmaskPii harmlessly (it only restores known placeholders).
export function unmaskSnapshot(s: ExtractedSnapshot, secrets: PiiSecret[]): ExtractedSnapshot {
  return {
    matrix: s.matrix.map((r) => ({
      ...r,
      finding: unmaskPii(r.finding, secrets),
      mitigation: unmaskPii(r.mitigation, secrets),
    })),
    ratios: s.ratios.map((series) => ({
      ...series,
      points: series.points.map((p) => ({ ...p, raw: unmaskPii(p.raw, secrets) })),
    })),
    collateral: s.collateral,
    racDeviations: s.racDeviations.map((d) => ({
      item: unmaskPii(d.item, secrets),
      justification: unmaskPii(d.justification, secrets),
    })),
  }
}

export type PiiApp = Pick<LoanApplication, 'nasabahName' | 'nik' | 'phoneNumber' | 'whatsappNumber' | 'namaUsaha'>

export function buildReport(runId: string, extractedAt: string, ok: boolean, fields: FieldReport[] = []): ExtractionReport {
  return { runId, extractedAt, ok, fields }
}
