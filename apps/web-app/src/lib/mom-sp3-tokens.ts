import { formatRupiah } from './sla-utils'
import type { LoanApplication } from './types'

// Minimal token sets + one-way fill builders for the MoM (committee minutes) and SP3 (offer letter)
// documents. These are SIMPLER than MUAP/RSK (no AI-narrative, no extraction round-trip), so they
// live in this self-contained module rather than the heavy MUAP/RSK registry. Templates carry these
// names as {{token}} literals; the generator (server/docs/mom-sp3.ts) fills them once (Mizan → Doc),
// then the maker owns the Doc. document-system.md §"Four documents" · creation triggers in ai-assist.md
// (MoM = invoke, no AI; SP3 = approved→auto / conditional→RM-invoke).
// NOTE: the V3 masters (de-customized from the real reference docs by scripts/author-momsp3-masters.ts)
// only carry a SUBSET of these tokens — the real format has no single slot for sp3_kondisi /
// mom_{peserta,keputusan,kondisi}, so those fills are harmless no-ops (generateMomSp3Doc skips absent
// tokens). Builders keep them so other/future templates can use them.

export const SP3_TOKENS = [
  'sp3_no',
  'sp3_tanggal',
  'nasabah_nama',
  'nasabah_alamat',
  'sp3_plafond',
  'sp3_tenor',
  'sp3_imbal_hasil',
  'sp3_akad',
  'sp3_sifat',
  'sp3_kondisi',
] as const

export const MOM_TOKENS = [
  'mom_tanggal',
  'mom_lokasi',
  'mom_peserta',
  'mom_nasabah',
  'mom_muap_ref',
  'mom_rsk_ref',
  'mom_plafond',
  'mom_tenor',
  'mom_akad',
  'mom_keputusan',
  'mom_kondisi',
] as const

// Shared field derivations — both documents MUST present these identically (committee minutes and the
// offer letter quote the same approved terms), so the "approved ?? requested" fallback lives once.
function nasabahLabel(app: LoanApplication): string {
  return app.namaUsaha?.trim() || app.nasabahName
}
function plafondText(app: LoanApplication): string {
  return formatRupiah(app.approvedPlafond ?? app.requestedPlafond)
}
function tenorText(app: LoanApplication): string {
  return `${app.approvedTenorMonths ?? app.requestedTenorMonths} bulan`
}

function decisionText(app: LoanApplication): string {
  switch (app.komiteDecision) {
    case 'approve':
      return 'Disetujui'
    case 'conditional':
      return 'Disetujui dengan syarat'
    case 'reject':
      return 'Ditolak'
    default:
      return 'Belum diputuskan'
  }
}

function todayId(): string {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** SP3 offer-letter fill values from an approved application (one-way; the RM edits the Doc after). */
export function buildSp3Fill(
  app: LoanApplication,
  opts: { letterNo?: string; date?: string; address?: string } = {},
): Record<string, string> {
  const margin = app.approvedMarginRate ?? app.marginRate
  return {
    sp3_no: opts.letterNo ?? '—',
    sp3_tanggal: opts.date ?? todayId(),
    nasabah_nama: nasabahLabel(app),
    nasabah_alamat: opts.address ?? '—',
    sp3_plafond: plafondText(app),
    sp3_tenor: tenorText(app),
    sp3_imbal_hasil: margin != null ? `Eq. ${margin}% eff p.a.` : '—',
    sp3_akad: app.akadType,
    sp3_sifat: 'Revolving',
    sp3_kondisi: app.komiteDecisionNote?.trim() || '—',
  }
}

/** MoM committee-minutes fill values from the application + committee outcome. */
export function buildMomFill(
  app: LoanApplication,
  opts: { date?: string; location?: string; attendees?: string; muapRef?: string; rskRef?: string } = {},
): Record<string, string> {
  return {
    mom_tanggal: opts.date ?? todayId(),
    mom_lokasi: opts.location ?? 'Hybrid – Online',
    mom_peserta: opts.attendees ?? '—',
    mom_nasabah: nasabahLabel(app),
    mom_muap_ref: opts.muapRef ?? '—',
    mom_rsk_ref: opts.rskRef ?? '—',
    mom_plafond: plafondText(app),
    mom_tenor: tenorText(app),
    mom_akad: app.akadType,
    mom_keputusan: decisionText(app),
    mom_kondisi: app.komiteDecisionNote?.trim() || '—',
  }
}
