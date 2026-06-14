import type { LoanApplication, TemplateDoc } from '@/lib/types'
import { akadConfig, returnLabelCap, hasStricterSyariahBar } from '@/lib/akad-config'
import { formatRupiah } from '@/lib/sla-utils'

// Default document templates (MUAP / RSK). The app duplicates one of these onto
// an application on first open ("Buat dari Template"), then the owner edits the
// per-application copy. V1 ships a single hard-coded default per document; a
// configurable Settings editor is deferred. Placeholders are filled at
// instantiation time from the application's own data + akad terminology, so the
// seeded draft is already specific rather than a blank form.

// ── MUAP (Memorandum Usulan Analisa Pembiayaan) ─────────────────────────────
export function instantiateMuapDoc(app: LoanApplication): TemplateDoc {
  const cfg = akadConfig(app.akadType)
  const ret = returnLabelCap(app.akadType)
  return {
    sections: [
      {
        id: 'ringkasan',
        title: 'Ringkasan Usulan',
        body: `Diusulkan pembiayaan ${app.akadType} sebesar ${formatRupiah(app.requestedPlafond)} dengan tenor ${app.requestedTenorMonths} bulan untuk ${app.nasabahName}. Tujuan penggunaan: ${app.purpose}.`,
      },
      {
        id: 'struktur',
        title: `Struktur Pembiayaan & ${ret}`,
        body: cfg.usesNisbah
          ? `Skema bagi hasil (${app.akadType}). Nisbah bagi hasil dan dasar proyeksi keuntungan dirinci pada tab Data. Analis memastikan proyeksi arus kas usaha mendukung porsi bagi hasil yang disepakati.`
          : `Skema ${app.akadType} dengan ${cfg.returnLabel}. Besaran ${cfg.returnLabel}, harga perolehan, dan jadwal angsuran dirinci pada tab Data dan harus transparan sesuai prinsip syariah.`,
      },
      {
        id: 'catatan',
        title: 'Catatan Analis',
        body: '',
      },
    ],
  }
}

// ── RSK (Risk Summary Komite) ───────────────────────────────────────────────
export function instantiateRskDoc(app: LoanApplication): TemplateDoc {
  const stricter = hasStricterSyariahBar(app.akadType)
  return {
    sections: [
      {
        id: 'profil-risiko',
        title: 'Profil Risiko',
        body: `Profil risiko ${app.nasabahName}: DSR ${app.hardGates.dsr}%, LTV ${app.hardGates.ltv}%, Kol ${app.hardGates.kol}. ${app.hardGateViolations.length ? 'Terdapat flag pada: ' + app.hardGateViolations.join(', ') + '.' : 'Parameter utama berada dalam appetite awal.'}`,
      },
      {
        id: 'mitigasi',
        title: 'Mitigasi & Covenant',
        body: stricter
          ? 'Akad Mudharabah: pastikan batasan ruang lingkup usaha, kewenangan pengelolaan, serta definisi kelalaian/pelanggaran (ta’addi/taqshir) tercantum jelas dalam akad. Tetapkan covenant pelaporan keuntungan berkala.'
          : 'Tetapkan covenant pelaporan dan monitoring sesuai indikator risiko di atas.',
      },
      {
        id: 'kesimpulan',
        title: 'Kesimpulan Risk Team',
        body: '',
      },
    ],
  }
}
