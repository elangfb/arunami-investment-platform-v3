// MUAP/RSK narrative drafting via Gemini. ONE structured-output call per document
// (JSON keyed by narrative tokens), validated then run through a compliance guard
// before it can touch the Doc. This module produces PROSE ONLY; authoritative
// numbers are filled deterministically elsewhere (server/docs/seed.ts).
//
// Compliance teeth: the response schema contains no level/recommendation field, the
// system instruction forbids them, and scrubNarrative() drops any field that still
// smuggles a risk level or a decision verdict — so even a disobedient model cannot
// write a gating value into the document. On any failure the generator returns {}
// and the caller falls back to the deterministic narrative (doc creation never breaks).

import { log, errField } from '../log'
import { z } from 'zod'
import { inferenceProvider } from './provider'
import { maskForEgress, blockOnResidualPii } from './redact'
import { recordAiInteraction } from './audit'
import { unmaskPii, piiSecrets } from '../../lib/pii-mask'
import type { SeedContext } from '../../lib/seed-context'
import { MUAP_NARRATIVE_TOKENS, RSK_NARRATIVE_TOKENS, RSK_ASPECT_KEYS } from '../docs/seed'
import { getActivePrompt } from '../config/ai-prompts'
import { akadConfig, returnLabelCap } from '../../lib/akad-config'
import { formatRupiah } from '../../lib/sla-utils'
import { scrubNarrative, type DocKind, type ScrubResult } from './narrative-scrub'

// Re-export the pure scrub guard so existing `from './narrative'` consumers keep working;
// the implementation lives in narrative-scrub.ts (DB-free, hermetically unit-tested).
export { scrubNarrative, type ScrubResult }

// Per-token drafting instructions, distilled from the masters' own [bracket]
// guidance (the slots anchored by scripts/setup-template-ranges.ts) — bank-authored
// intent, kept static (no live documents.get needed). Each line mirrors what the
// corresponding MUAP section actually asks for, so the prose fits the slot.
const FIELD_GUIDANCE_MUAP: Record<string, string> = {
  m_ringkasan_usulan:
    'Ringkasan usulan fasilitas: kondisi fasilitas existing (bila ada), tujuan tiap fasilitas, pertimbangan besaran plafond, mekanisme pencairan, dan porsi bank vs self-financing.',
  m_tujuan_naratif:
    'Kebutuhan pembiayaan secara naratif: masalah cashflow yang dihadapi, tujuan spesifik penggunaan dana, dan mengapa besaran yang diminta tepat.',
  m_character:
    '5C — Character: rekam jejak, reputasi, dan integritas pengurus berdasarkan data verifikasi yang tersedia.',
  m_capacity:
    'Analisis tren laba rugi: konsistensi pertumbuhan pendapatan dan drivernya, stabilitas margin, serta kualitas laba (operasional/recurring vs one-off). Kaitkan dengan kapasitas bayar.',
  m_capital:
    'Analisis neraca: kualitas aset (mis. aging piutang), piutang/utang pihak terkait yang tidak wajar, dan konsistensi pertumbuhan aset dengan bisnis.',
  m_condition:
    'Gambaran industri: definisi dan skala sektor, pemain utama dan posisi nasabah, regulasi terkait, serta tren pertumbuhan 3–5 tahun terakhir.',
  m_collateral:
    'Keterangan agunan: status kepemilikan, penilaian KJPP (bila ada), rencana pengikatan (HT/Fidusia), dan catatan khusus. JANGAN menyimpulkan level/rating kecukupan.',
  m_syariah:
    'Opini syariah naratif: mengapa akad tepat untuk tujuan pembiayaan, elemen fatwa DSN-MUI yang terpenuhi, dan aspek yang perlu dikonfirmasi ke DPS sebelum akad.',
}

// Per-aspect RSK risk-narrative guidance (workflow-finetune.md §6 — local extension). Each
// aspect has TWO slots: finding + mitigation. RISK LEVEL is HUMAN-ONLY — no token, no guidance,
// no AI prose. scrubNarrative is the second line of defence.
const RSK_ASPECT_GUIDANCE_BASE: Record<string, { finding: string; mitigation: string }> = {
  character: {
    finding: 'Character — temuan terkait integritas, reputasi, dan rekam jejak pengurus dari data verifikasi yang tersedia. JANGAN menetapkan level/rating.',
    mitigation: 'Character — langkah mitigasi sesuai temuan (mis. uji KYC tambahan, klarifikasi catatan SLIK).',
  },
  capacity: {
    finding: 'Capacity — temuan terkait kemampuan bayar dari arus kas/penghasilan; kaitkan dengan DSR dan beban angsuran/proyeksi bagi hasil. JANGAN menetapkan level.',
    mitigation: 'Capacity — covenant pemantauan arus kas (mis. rekening rutin di bank, laporan keuangan berkala).',
  },
  capital: {
    finding: 'Capital — temuan struktur permodalan, kontribusi self-financing, dan ketahanan modal usaha. JANGAN menetapkan level.',
    mitigation: 'Capital — mitigasi sesuai temuan (mis. tambahan setoran, batas penarikan modal kerja).',
  },
  condition: {
    finding: 'Condition — temuan kondisi industri/sektor, prospek usaha, dan faktor makro yang relevan bagi pemohon. JANGAN menetapkan level.',
    mitigation: 'Condition — mitigasi risiko pasar/makro (mis. diversifikasi pelanggan, kontrak jangka panjang).',
  },
  collateral: {
    finding: 'Collateral — temuan jenis dan kecukupan agunan; kaitkan dengan nilai appraisal dan LTV. JANGAN menetapkan level/rating.',
    mitigation: 'Collateral — pengikatan (HT/Fidusia) yang sesuai, asuransi, dan langkah pemeliharaan nilai agunan.',
  },
  sharia_compliance: {
    finding: 'Kepatuhan Syariah — temuan terkait kehalalan usaha, kesesuaian akad dengan fatwa DSN-MUI, dan aspek yang perlu dikonfirmasi ke DPS. JANGAN memberi opini akhir kelayakan syariah.',
    mitigation: 'Kepatuhan Syariah — langkah mitigasi (mis. konfirmasi DPS, klausul akad spesifik).',
  },
  sharia_structuring: {
    finding: 'Struktur Syariah — temuan terkait struktur akad (mis. nisbah, kepemilikan objek, kewenangan pengelolaan) untuk meminimalkan gharar/maysir/riba. JANGAN memberi opini akhir.',
    mitigation: 'Struktur Syariah — mitigasi struktural (mis. definisi ta’addi/taqshir, batasan ruang lingkup usaha, jadwal pelaporan bagi hasil).',
  },
}

const RSK_NARRATIVE_GUIDANCE: Record<string, string> = Object.fromEntries(
  RSK_ASPECT_KEYS.flatMap((k) => [
    [`${k}_finding`, RSK_ASPECT_GUIDANCE_BASE[k].finding],
    [`${k}_mitigation`, RSK_ASPECT_GUIDANCE_BASE[k].mitigation],
  ]),
)
const FIELD_GUIDANCE_ALL = { ...FIELD_GUIDANCE_MUAP, ...RSK_NARRATIVE_GUIDANCE }

// Admin-configurable per surface (AiPromptVersion). Fallback = code default (lib/ai-prompts.ts)
// = the historical inline text — so behavior on an empty config table is unchanged.
function draftingSystemInstruction(docKind: DocKind): Promise<string> {
  return getActivePrompt(docKind === 'rsk' ? 'narrative_rsk' : 'narrative_muap')
}

// Zod response schema (AI SDK generateObject): an object of string fields, one per requested
// token. No level/recommendation key exists, so the model is structurally unable to return one.
function objSchema(tokens: readonly string[]): z.ZodType<Record<string, string>> {
  const shape: Record<string, z.ZodString> = {}
  for (const t of tokens) shape[t] = z.string()
  return z.object(shape) as z.ZodType<Record<string, string>>
}

function buildNarrativePrompt(
  ctx: SeedContext,
  docKind: DocKind,
  tokens: readonly string[],
  guidance: Record<string, string> = FIELD_GUIDANCE_ALL,
  contextCascade = '',
): string {
  const cfg = akadConfig(ctx.akadType)
  const ret = cfg.usesNisbah
    ? `${ctx.nisbahBankPercent ?? '?'} : ${ctx.nisbahCustomerPercent ?? '?'} (Bank : Nasabah)`
    : ctx.marginRate != null
      ? `${ctx.marginRate}% per tahun`
      : '—'
  const lines = [
    'DATA APLIKASI:',
    `- Nasabah: ${ctx.namaUsaha || ctx.nasabahName} (${ctx.nasabahType})`,
    `- Akad: ${ctx.akadType}`,
    `- Plafond diusulkan: ${formatRupiah(ctx.requestedPlafond)}; Tenor: ${ctx.requestedTenorMonths} bulan`,
    `- Tujuan: ${ctx.purpose}`,
    `- ${returnLabelCap(ctx.akadType)}: ${ret}`,
    `- Hard gate: DSR ${ctx.hardGates.dsr}%, LTV ${ctx.hardGates.ltv}%, Kol ${ctx.hardGates.kol}`,
    `- Pelanggaran hard gate: ${ctx.hardGateViolations.join(', ') || 'tidak ada'}`,
    `- Penghasilan/arus kas bersih bulanan: ${formatRupiah(ctx.financialInputs.netMonthlyIncome)}`,
    `- Kewajiban bulanan berjalan: ${formatRupiah(ctx.financialInputs.existingMonthlyObligations)}`,
    `- Nilai appraisal agunan: ${formatRupiah(ctx.financialInputs.collateralAppraisedValue)}`,
  ]
  if (ctx.financialInputs.projectionBasis) {
    lines.push(`- Dasar proyeksi bagi hasil: ${ctx.financialInputs.projectionBasis}`)
  }
  if (ctx.analysis) {
    lines.push(
      '',
      'KONTEKS ANALIS SEBELUMNYA (rujukan saja; verifikasi terhadap DATA, JANGAN salin mentah):',
      `- Character: ${ctx.analysis.character || '—'}`,
      `- Capacity: ${ctx.analysis.capacity || '—'}`,
      `- Capital: ${ctx.analysis.capital || '—'}`,
      `- Condition: ${ctx.analysis.condition || '—'}`,
      `- Collateral: ${ctx.analysis.collateral || '—'}`,
      `- Syariah: ${ctx.analysis.syariah || '—'}`,
    )
  }
  if (ctx.bureauSummary) {
    lines.push(
      '',
      'KONTEKS RINGKASAN BIRO (SLIK/Pefindo, dirangkum RM; rujukan — JANGAN salin mentah, bukan angka resmi):',
      ctx.bureauSummary,
    )
  }
  if (ctx.documentTexts?.length) {
    lines.push(
      '',
      'KONTEKS DOKUMEN TERUNGGAH (hasil OCR; rujukan untuk verifikasi — JANGAN salin mentah,',
      'JANGAN memperlakukan angka di sini sebagai keputusan/angka resmi; verifikasi terhadap DATA di atas):',
    )
    for (const d of ctx.documentTexts) lines.push(`### ${d.label}`, d.text)
  }
  if (ctx.exploredSources?.length) {
    lines.push(
      '',
      'KONTEKS RISET WEB TERVERIFIKASI (hasil pencarian; sudah dikutip dengan URL — boleh disebut',
      'dengan menautkan URL bila relevan; JANGAN mengarang fakta di luar daftar; bukan angka resmi):',
    )
    for (const s of ctx.exploredSources) lines.push(`- [${s.title}](${s.url}) — ${s.claim}`)
  }
  // Layered AI context (design §5) — reference grounding appended after the data blocks; the task
  // instruction below stays LAST so the model knows what to output. Per the 'narrative' policy (all 3).
  if (contextCascade.trim()) lines.push('', contextCascade.trim())
  lines.push('', 'BAGIAN YANG DIMINTA (isi setiap kunci JSON berikut):')
  for (const t of tokens) lines.push(`- ${t}: ${guidance[t] ?? ''}`)
  return lines.join('\n')
}

// ── Compliance guard ────────────────────────────────────────────────────────────
// scrubNarrative drops (does not edit) any field that states a decision verdict or,
// for RSK, a risk-level verdict — see ./narrative-scrub (DB-free, hermetically tested).

// ── Generation ──────────────────────────────────────────────────────────────────
// auditUserId attributes the AI egress in the AiInteraction trail. Narrative drafting is
// often system-initiated (auto-draft on Stage-3 entry) → 'system'; the manual "Buat Dokumen"
// button and the analysis route pass the acting user.
async function runNarrative(
  ctx: SeedContext,
  docKind: DocKind,
  tokens: readonly string[],
  guidance: Record<string, string> = FIELD_GUIDANCE_ALL,
  auditUserId = 'system',
  contextCascade = '',
): Promise<Record<string, string>> {
  try {
    // Mask-in / unmask-out (OJK + Bank §1.1 + name ruling 2026-05-24): the customer
    // name/business name never leave Hijra infra — the model drafts with [NASABAH]/[USAHA]
    // placeholders. The SYSTEM substitutes the known real values back into the output below
    // (unmaskPii), so the real name in the Doc originates from our known value, never the
    // model. Generic NIK/phone/email patterns are caught too (and NOT reversed).
    const secrets = piiSecrets(ctx)
    // Mask-in via the shared redaction seam (NER-ready). Residual backstop is fail-OPEN by
    // default: a leaked structured-PII TYPE is logged (never the value) but the draft still
    // proceeds; set PII_RESIDUAL_BLOCK=1 to fall back to the deterministic narrative ({}) for prod.
    const { masked: prompt, residual } = maskForEgress(buildNarrativePrompt(ctx, docKind, tokens, guidance, contextCascade), secrets)
    if (residual.length) {
      const block = blockOnResidualPii()
      log.warn('pii.residual_detected', { surface: 'narrative', docKind, appId: ctx.applicationId, phase: 'prompt', types: residual, blocked: block })
      if (block) return {}
    }
    const obj = await inferenceProvider().generateStructured(
      await draftingSystemInstruction(docKind),
      prompt,
      objSchema(tokens),
      // Generous budget: 8 narrative fields × a few sentences, plus Gemini-3 thinking
      // tokens count against this — too low truncates the JSON mid-string.
      { temperature: 0.2, maxOutputTokens: docKind === 'muap' ? 8192 : 4096 },
    )
    // generateObject returns a parsed, schema-validated object; keep only known tokens —
    // missing ones fall back to the deterministic narrative (caller-side).
    const known: Record<string, string> = {}
    for (const t of tokens) {
      if (typeof obj[t] === 'string') known[t] = obj[t]
    }
    // Audit the AI egress (G3): store the MASKED prompt + MASKED reply, never raw PII. The
    // model worked in the masked domain (placeholders); re-mask the serialized reply as a
    // backstop in case it echoed a structured identifier, mirroring the chat path. Best-effort
    // — a failed audit write logs but never discards already-generated prose.
    try {
      const { masked: maskedReply } = maskForEgress(JSON.stringify(known), secrets)
      await recordAiInteraction({
        appId: ctx.applicationId,
        userId: auditUserId,
        surface: 'narrative',
        maskedPrompt: prompt,
        maskedReply,
        model: inferenceProvider().model(),
      })
    } catch (e) {
      log.error('narrative.audit_failed', { docKind, appId: ctx.applicationId, ...errField(e) })
    }
    const { fields, violations } = scrubNarrative(known, docKind)
    if (violations.length) {
      log.warn('narrative.guard_dropped', { docKind, count: violations.length, violations })
    }
    // Unmask-out: restore the known PII placeholders to their real values in the model's
    // prose. The model never saw the real PII; the system performs the substitution.
    const restored: Record<string, string> = {}
    for (const [k, v] of Object.entries(fields)) restored[k] = unmaskPii(v, secrets)
    return restored
  } catch (e) {
    log.warn('narrative.generation_failed', { docKind, ...errField(e) })
    return {}
  }
}

// Returns a map of MUAP narrative tokens → prose (subset; {} on any failure). `contextCascade` is the
// pre-rendered layered AI context (design §5), gated for the 'narrative' surface by the caller.
export function generateMuapNarrative(ctx: SeedContext, auditUserId = 'system', contextCascade = ''): Promise<Record<string, string>> {
  return runNarrative(ctx, 'muap', MUAP_NARRATIVE_TOKENS, FIELD_GUIDANCE_ALL, auditUserId, contextCascade)
}

// Returns a map of RSK narrative tokens → prose (subset; {} on any failure).
export function generateRskNarrative(ctx: SeedContext, auditUserId = 'system', contextCascade = ''): Promise<Record<string, string>> {
  return runNarrative(ctx, 'rsk', RSK_NARRATIVE_TOKENS, FIELD_GUIDANCE_ALL, auditUserId, contextCascade)
}

// ── 5C+1S analysis (app-side, shown in AnalysisTab) ───────────────────────────────
// The MUAP/RSK templates (fixed by Hijra) can't hold every dimension (e.g. Character),
// so the full 5C+1S lives app-side. This drafts those six aspects from app data; the
// analyst reviews/edits them. Same anti-hallucination + verdict guard as the doc
// narrative (the model never asserts a recommendation; scores stay deterministic).
export const ANALYSIS_ASPECTS = ['character', 'capacity', 'capital', 'condition', 'collateral', 'syariah'] as const

const ANALYSIS_GUIDANCE: Record<string, string> = {
  character: '5C Character: integritas & reputasi pengurus, rekam jejak pembayaran (SLIK/Kolektibilitas), dan itikad baik — berdasarkan data verifikasi yang tersedia.',
  capacity: '5C Capacity: kemampuan membayar dari arus kas/penghasilan; kaitkan dengan DSR dan beban angsuran/proyeksi bagi hasil.',
  capital: '5C Capital: struktur permodalan, kontribusi self-financing, dan ketahanan modal usaha.',
  condition: '5C Condition: kondisi industri/sektor, prospek usaha, dan faktor makro yang relevan.',
  collateral: '5C Collateral: jenis dan kecukupan agunan; kaitkan dengan nilai appraisal dan LTV. JANGAN menyimpulkan level/rating.',
  syariah: '1S Kepatuhan Syariah: kesesuaian akad dengan fatwa DSN-MUI, kehalalan usaha, dan catatan untuk DPS bila perlu.',
}

// Returns a map of 5C+1S aspect → prose (subset; {} on any failure). Caller overlays
// these on the deterministic draft so every aspect is always present.
export function generateAnalysis(ctx: SeedContext, auditUserId = 'system', contextCascade = ''): Promise<Record<string, string>> {
  return runNarrative(ctx, 'muap', ANALYSIS_ASPECTS, ANALYSIS_GUIDANCE, auditUserId, contextCascade)
}
