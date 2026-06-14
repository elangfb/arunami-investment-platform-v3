'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Database, Info, ShieldCheck } from 'lucide-react'
import { DossierSection } from '@/components/application/DossierSection'
import { OcrFieldRow, ProvenanceBadge } from '@/components/application/OcrSuggestionControls'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SegmentedToggle } from '@/components/ui/form-section'
import { StatusChip } from '@/components/shared/StatusChip'
import { useActor } from '@/context/ActorProvider'
import { canSummarizeBureau, canWorkDeskNow, hasDesk } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { computeHardGates } from '@/lib/financials'
import { formatRupiah } from '@/lib/sla-utils'
import { akadConfig } from '@/lib/akad-config'
import { confirmExtractedFieldAction, confirmKolAction, generateBureauSummaryAction, recordAppraisalAction, saveFinancialsAction, type RecordAppraisalInput } from '@/server/actions/application-data'
import { attestAmlAction, reviseProposalAction, withdrawApplicationAction } from '@/server/actions/application-stage'
import { amlAttested, AML_ATTESTATION_STATEMENT, type AmlAttestationInput } from '@/lib/aml'
import type { AppraisalPath, AppraisalRecord, ExtractionSource, LoanApplication } from '@/lib/types'
import { isPreKomite } from '@/lib/workflow'
import type { ProposalRevision } from '@/lib/proposal-revision'

type DataTabProps = {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  onViewDocuments: () => void
}

type OcrMeta = {
  provenance: ExtractionSource | undefined
  docLabel: string
  onViewDoc: () => void
}

const collateralLabels: Record<NonNullable<LoanApplication['collateralType']>, string> = {
  none: 'Tanpa Agunan',
  fixed_asset: 'Properti / Tanah',
  vehicle: 'Kendaraan',
  guarantor: 'Jaminan Perorangan',
}

const APPRAISAL_PATH_OPTIONS: { value: AppraisalPath; label: string }[] = [
  { value: 'internal', label: 'Internal' },
  { value: 'kjpp_short', label: 'KJPP ringkas' },
  { value: 'kjpp_long', label: 'KJPP lengkap' },
]
const APPRAISAL_PATH_LABELS: Record<AppraisalPath, string> = {
  internal: 'Internal',
  kjpp_short: 'KJPP — laporan ringkas',
  kjpp_long: 'KJPP — laporan lengkap',
}

const AML_RESULT_OPTIONS: { value: NonNullable<AmlAttestationInput['result']>; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  { value: 'hit-cleared', label: 'Hit — sudah ditangani' },
]
const AML_RESULT_LABELS: Record<NonNullable<AmlAttestationInput['result']>, string> = {
  clear: 'Clear',
  'hit-cleared': 'Hit — sudah ditangani',
}

type ScreenedParty = { nama: string; peran?: string }

function AmlCompliance({ app, canAttest, onAttest }: { app: LoanApplication; canAttest: boolean; onAttest: (input: AmlAttestationInput) => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<NonNullable<AmlAttestationInput['result']>>('clear')
  const [catatan, setCatatan] = useState('')
  // Prefill the first party row with the nasabah (no Customer roster aggregate is exposed in the UI
  // layer; the task allows a free list). Names only — NEVER a NIK (PII: screenedParties carry names).
  const [parties, setParties] = useState<ScreenedParty[]>([
    { nama: app.nasabahType === 'business' ? (app.namaUsaha ?? app.nasabahName) : app.nasabahName, peran: app.nasabahType === 'business' ? 'Perusahaan' : 'Nasabah' },
  ])

  if (amlAttested(app) && app.amlAttestation) {
    const att = app.amlAttestation
    const when = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(att.attestedAt))
    return (
      <div className="space-y-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 space-y-1 text-success-foreground">
            <span>AML diatestasi oleh {att.attestedByName} · {when}</span>
            {att.result && (
              <div className="pt-0.5">
                <StatusChip tone={att.result === 'clear' ? 'success' : 'warning'} label={AML_RESULT_LABELS[att.result]} />
              </div>
            )}
            {att.catatan && <p className="text-xs text-success-foreground/90">{att.catatan}</p>}
            {att.screenedParties && att.screenedParties.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Pihak yang disaring: {att.screenedParties.map((p) => p.peran ? `${p.nama} (${p.peran})` : p.nama).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!canAttest) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Atestasi Initial AML (DTTOT/PEP/negative-list) belum dilakukan.</span>
      </div>
    )
  }

  const hitNeedsCatatan = result === 'hit-cleared' && !catatan.trim()
  const setParty = (i: number, patch: Partial<ScreenedParty>) =>
    setParties((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-background/60 p-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Hasil pemeriksaan</p>
        <SegmentedToggle value={result} onChange={setResult} options={AML_RESULT_OPTIONS} />
      </div>
      {result === 'hit-cleared' && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Catatan penanganan hit <span className="text-danger">*</span></span>
          <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} placeholder="Mis. nama cocok dengan daftar PEP, telah diverifikasi sebagai orang berbeda berdasarkan tanggal lahir / dokumen pendukung." />
          <span className="text-xs text-muted-foreground">Wajib diisi ketika ada hit yang sudah ditangani — jejak audit.</span>
        </label>
      )}
      {result === 'clear' && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Catatan (opsional)</span>
          <Textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} placeholder="Catatan tambahan pemeriksaan (opsional)." />
        </label>
      )}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Pihak yang disaring</p>
        <p className="text-xs text-muted-foreground">Perusahaan + pengurus/pemegang saham. Nama saja — jangan masukkan NIK.</p>
        <div className="space-y-2">
          {parties.map((p, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input className="min-w-0 flex-1" value={p.nama} onChange={(e) => setParty(i, { nama: e.target.value })} placeholder="Nama" />
              <Input className="w-40" value={p.peran ?? ''} onChange={(e) => setParty(i, { peran: e.target.value })} placeholder="Peran (mis. Direktur)" />
              {parties.length > 1 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setParties((ps) => ps.filter((_, idx) => idx !== i))}>Hapus</Button>
              )}
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setParties((ps) => [...ps, { nama: '' }])}>+ Tambah pihak</Button>
      </div>
      <label className="flex items-start gap-2 border-t pt-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>{AML_ATTESTATION_STATEMENT}</span>
      </label>
      <p className="pl-6 text-xs text-muted-foreground">
        Pemeriksaan DTTOT/PEP/negative-list dilakukan secara eksternal oleh CS/Compliance — MIZAN tidak melakukan screening. RM mengonfirmasi pemeriksaan awal telah dilakukan.
      </p>
      <Button
        size="sm"
        disabled={!confirmed || hitNeedsCatatan || busy}
        onClick={async () => {
          setBusy(true)
          try {
            const cleaned = parties.map((p) => ({ nama: p.nama.trim(), peran: p.peran?.trim() || undefined })).filter((p) => p.nama)
            await onAttest({
              result,
              ...(catatan.trim() ? { catatan: catatan.trim() } : {}),
              ...(cleaned.length ? { screenedParties: cleaned } : {}),
            })
          } finally { setBusy(false) }
        }}
      >
        Konfirmasi atestasi AML
      </Button>
    </div>
  )
}

// Parse a free-typed Rupiah string ("1.500.000.000" / "1500000000") to a number; '' → undefined.
function parseAmount(raw: string): number | undefined {
  const digits = raw.replace(/[^\d]/g, '')
  return digits === '' ? undefined : Number(digits)
}
// Group an amount with id-ID thousands separators for display in the input (no currency symbol).
function groupAmount(value: number | undefined): string {
  return value == null ? '' : new Intl.NumberFormat('id-ID').format(value)
}
// Format an ISO date string as a Jakarta date-only label (no time).
function formatDateOnly(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(iso))
}

function AppraisalCompliance({ app, canRecord, onRecord }: { app: LoanApplication; canRecord: boolean; onRecord: (input: RecordAppraisalInput) => Promise<void> }) {
  const [path, setPath] = useState<AppraisalPath>(app.appraisalRecord?.path ?? 'internal')
  const [nilaiPasar, setNilaiPasar] = useState<number | undefined>(app.appraisalRecord?.nilaiPasar)
  const [nilaiLikuidasi, setNilaiLikuidasi] = useState<number | undefined>(app.appraisalRecord?.nilaiLikuidasi)
  const [penilai, setPenilai] = useState(app.appraisalRecord?.penilai ?? '')
  const [tanggalLaporan, setTanggalLaporan] = useState(app.appraisalRecord?.tanggalLaporan?.slice(0, 10) ?? '')
  const [busy, setBusy] = useState(false)

  // P2 OCR advisory figures (read-only suggestions, never auto-confirm). Subtle "OCR menyarankan" hint.
  const advisory = app.advisoryExtractions ?? {}
  const ocrPasar = typeof advisory.nilaiPasar?.value === 'number' ? advisory.nilaiPasar.value : undefined
  const ocrLikuidasi = typeof advisory.nilaiLikuidasi?.value === 'number' ? advisory.nilaiLikuidasi.value : undefined
  // ⚠️ shape-coded mismatch chip when the RECORDED figures disagree with the OCR advisory (lib/ocr-crosscheck).
  const appraisalMismatch = advisory.penilaian?.crossCheck?.status === 'mismatch'
  const mismatchNote = advisory.penilaian?.crossCheck?.note

  const recorded: AppraisalRecord | null = app.appraisalRecord ?? (app.appraisalPath ? { path: app.appraisalPath } : null)

  if (recorded && !canRecord) {
    const ltvValue = app.financialInputs.collateralAppraisedValue
    return (
      <div className="space-y-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 space-y-1 text-success-foreground">
            <p>Penilaian agunan dicatat — jalur {APPRAISAL_PATH_LABELS[recorded.path]}</p>
            {recorded.nilaiPasar != null && <p>Nilai pasar <span className="tabular">{formatRupiah(recorded.nilaiPasar)}</span></p>}
            {recorded.nilaiLikuidasi != null && <p>Nilai likuidasi <span className="tabular">{formatRupiah(recorded.nilaiLikuidasi)}</span></p>}
            {recorded.penilai && <p>Penilai/KJPP: {recorded.penilai}</p>}
            {recorded.tanggalLaporan && <p>Tanggal laporan: {formatDateOnly(recorded.tanggalLaporan)}</p>}
            {ltvValue > 0 && <p className="text-xs text-muted-foreground">Nilai untuk LTV (input keuangan): <span className="tabular">{formatRupiah(ltvValue)}</span></p>}
          </div>
        </div>
        {appraisalMismatch && (
          <div className="flex items-start gap-1.5 text-xs text-warning-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{mismatchNote ?? 'Nilai tercatat berbeda dari hasil OCR laporan appraisal — perlu telaah.'}</span>
          </div>
        )}
      </div>
    )
  }

  if (!recorded && !canRecord) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Penilaian agunan belum dicatat.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-background/60 p-3">
      <p className="text-sm text-muted-foreground">
        Catat metode dan hasil penilaian agunan. Pemilihan internal vs KJPP mengikuti aturan Hijra di luar MIZAN — MIZAN mencatat jalur dan angkanya untuk jejak audit. Nilai pasar/likuidasi bersifat advisory dan tidak otomatis mengisi input LTV.
      </p>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Jalur penilaian</p>
        <SegmentedToggle value={path} onChange={setPath} options={APPRAISAL_PATH_OPTIONS} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Nilai Pasar</span>
          <div className="flex items-center gap-1.5 rounded-lg border bg-input px-2.5 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring">
            <span className="text-sm text-muted-foreground">Rp</span>
            <input className="tabular w-full bg-transparent py-1.5 text-sm outline-none" inputMode="numeric" value={groupAmount(nilaiPasar)} onChange={(e) => setNilaiPasar(parseAmount(e.target.value))} placeholder="0" />
          </div>
          {ocrPasar != null && (
            <OcrSuggestHint value={ocrPasar} onUse={() => setNilaiPasar(ocrPasar)} />
          )}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Nilai Likuidasi</span>
          <div className="flex items-center gap-1.5 rounded-lg border bg-input px-2.5 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring">
            <span className="text-sm text-muted-foreground">Rp</span>
            <input className="tabular w-full bg-transparent py-1.5 text-sm outline-none" inputMode="numeric" value={groupAmount(nilaiLikuidasi)} onChange={(e) => setNilaiLikuidasi(parseAmount(e.target.value))} placeholder="0" />
          </div>
          {ocrLikuidasi != null && (
            <OcrSuggestHint value={ocrLikuidasi} onUse={() => setNilaiLikuidasi(ocrLikuidasi)} />
          )}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Penilai / KJPP</span>
          <Input value={penilai} onChange={(e) => setPenilai(e.target.value)} placeholder="Nama penilai internal atau KJPP" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Tanggal Laporan</span>
          <Input type="date" value={tanggalLaporan} onChange={(e) => setTanggalLaporan(e.target.value)} />
        </label>
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onRecord({
              path,
              ...(nilaiPasar !== undefined ? { nilaiPasar } : {}),
              ...(nilaiLikuidasi !== undefined ? { nilaiLikuidasi } : {}),
              ...(penilai.trim() ? { penilai: penilai.trim() } : {}),
              ...(tanggalLaporan ? { tanggalLaporan } : {}),
            })
          } finally { setBusy(false) }
        }}
      >
        {recorded ? 'Perbarui penilaian agunan' : 'Catat penilaian agunan'}
      </Button>
    </div>
  )
}

// Subtle read-only "OCR menyarankan" hint beside a value input — a suggestion the human may apply,
// never an auto-confirm. Circle icon = info (shape-coded, WCAG 1.4.1).
function OcrSuggestHint({ value, onUse }: { value: number; onUse: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Info className="size-3.5 text-info" aria-hidden />
      OCR menyarankan <span className="tabular font-medium">{formatRupiah(value)}</span>
      <button type="button" onClick={onUse} className="text-info underline-offset-2 hover:underline">Pakai</button>
    </span>
  )
}

export function DataTab({ app, onUpdate, onViewDocuments }: DataTabProps) {
  const actor = useActor()
  // Show the NIK confirm row only when the AO can actually act now (desk held + inside its stage
  // window) — matches the server gate so we never render a confirm button that would 403.
  const canConfirmNik = app.extractionSources?.nik === 'ocr_suggested' && canWorkDeskNow(actor, app, 'intake')
  // Legal-identity fields: show confirm row when ocr_suggested + actor can work intake desk now.
  const canConfirmIdentity = canWorkDeskNow(actor, app, 'intake')
  // RM bureau desk may enter Kol from stage 1 up to & including stage 2.
  const canEnterKol = hasDesk(actor, 'slik') && app.stage <= 2 && !app.kolEntered
  const canAttestAml = hasDesk(actor, 'intake') && app.stage <= 1
  const canRecordAppraisal = canWorkDeskNow(actor, app, 'appraisal')

  async function attestAml(input: AmlAttestationInput) {
    await runAction(() => attestAmlAction(app.id, input), onUpdate)
  }

  async function recordAppraisal(input: RecordAppraisalInput) {
    await runAction(() => recordAppraisalAction(app.id, input), onUpdate)
  }

  // Build extras entries for display (humanize keys).
  const extrasEntries = Object.entries(app.extractionExtras ?? {})

  return (
    <DossierSection
      icon={Database}
      title="Data"
      owners={['RM', 'LG', 'RA']}
      note="Data intake nasabah, kepatuhan awal, penilaian agunan, dan keuangan — dengan konfirmasi sumber OCR."
    >
      <div className="space-y-4">
        <Card>
        <CardHeader><CardTitle>Identitas Nasabah</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Nama Nasabah" value={app.nasabahName} />
          <FieldRow label="Jenis Nasabah" value={app.nasabahType === 'business' ? 'Badan Usaha' : 'Perorangan'} />
          {app.nasabahType === 'business' && app.namaUsaha && <FieldRow label="Nama Usaha" value={app.namaUsaha} />}
          {canConfirmNik ? (
            <NikConfirmRow app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
          ) : (
            <FieldRow label="NIK" value={app.nik ?? 'Belum diisi'} ocr={{ provenance: app.extractionSources?.nik, docLabel: 'KTP', onViewDoc: onViewDocuments }} />
          )}
          {/* NPWP — semua jenis nasabah */}
          {(canConfirmIdentity && app.extractionSources?.npwp === 'ocr_suggested') ? (
            <IdentityConfirmRow fieldPath="npwp" label="NPWP" docLabel="NPWP" app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
          ) : (
            app.npwp || app.extractionSources?.npwp ? (
              <OcrFieldRow app={app} label="NPWP" fieldPath="npwp" provenance={app.extractionSources?.npwp} docLabel="NPWP" onUpdate={onUpdate} onViewDocuments={onViewDocuments}>
                <span className="font-medium break-words">{app.npwp ?? 'Belum dikonfirmasi'}</span>
              </OcrFieldRow>
            ) : null
          )}
          {/* Alamat Legalitas — semua jenis nasabah */}
          {(canConfirmIdentity && app.extractionSources?.alamat === 'ocr_suggested') ? (
            <IdentityConfirmRow fieldPath="alamat" label="Alamat Legalitas" docLabel="NIB" app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
          ) : (
            app.alamat || app.extractionSources?.alamat ? (
              <OcrFieldRow app={app} label="Alamat Legalitas" fieldPath="alamat" provenance={app.extractionSources?.alamat} docLabel="NIB" onUpdate={onUpdate} onViewDocuments={onViewDocuments}>
                <span className="font-medium break-words">{app.alamat ?? 'Belum dikonfirmasi'}</span>
              </OcrFieldRow>
            ) : null
          )}
          {/* NIB — hanya nasabah bisnis */}
          {app.nasabahType === 'business' && (
            (canConfirmIdentity && app.extractionSources?.nib === 'ocr_suggested') ? (
              <IdentityConfirmRow fieldPath="nib" label="NIB" docLabel="NIB" app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
            ) : (
              app.nib || app.extractionSources?.nib ? (
                <OcrFieldRow app={app} label="NIB" fieldPath="nib" provenance={app.extractionSources?.nib} docLabel="NIB" onUpdate={onUpdate} onViewDocuments={onViewDocuments}>
                  <span className="font-medium break-words">{app.nib ?? 'Belum dikonfirmasi'}</span>
                </OcrFieldRow>
              ) : null
            )
          )}
          {/* Bidang Usaha — hanya nasabah bisnis */}
          {app.nasabahType === 'business' && (
            (canConfirmIdentity && app.extractionSources?.bidangUsaha === 'ocr_suggested') ? (
              <IdentityConfirmRow fieldPath="bidangUsaha" label="Bidang Usaha" docLabel="NIB" app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
            ) : (
              app.bidangUsaha || app.extractionSources?.bidangUsaha ? (
                <OcrFieldRow app={app} label="Bidang Usaha" fieldPath="bidangUsaha" provenance={app.extractionSources?.bidangUsaha} docLabel="NIB" onUpdate={onUpdate} onViewDocuments={onViewDocuments}>
                  <span className="font-medium break-words">{app.bidangUsaha ?? 'Belum dikonfirmasi'}</span>
                </OcrFieldRow>
              ) : null
            )
          )}
          <FieldRow label="No. Telepon" value={app.phoneNumber} />
          {app.whatsappNumber && <FieldRow label="Nomor WhatsApp" value={app.whatsappNumber} />}
        </CardContent>
      </Card>

      {/* Data tambahan dari dokumen — extras from OCR not mapped to a known field */}
      {extrasEntries.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Data tambahan dari dokumen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {extrasEntries.map(([key, { value, sourceDocType }]) => (
              <div key={key} className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
                <div className="shrink-0 text-muted-foreground sm:w-[220px]">
                  {key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{value}</span>
                  <span className="text-xs text-muted-foreground">({sourceDocType})</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AdvisoryExtractionsCard app={app} onViewDocuments={onViewDocuments} />

      <Card>
        <CardHeader><CardTitle>Permohonan (Diminta)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <FieldRow label="Plafond Diminta" value={formatRupiah(app.requestedPlafond)} />
          <FieldRow label="Tenor Diminta" value={`${app.requestedTenorMonths} bulan`} />
          <FieldRow label="Jenis Akad" value={app.akadType} />
          <FieldRow label="Jenis Agunan" value={app.collateralType ? collateralLabels[app.collateralType] : '-'} />
          <FieldRow label="Tujuan Pembiayaan" value={app.purpose} />
          <ReviseProposalControl app={app} onUpdate={onUpdate} />
          <WithdrawControl app={app} onUpdate={onUpdate} />
        </CardContent>
      </Card>

      {app.approvedPlafond != null && (
        <Card>
          <CardHeader><CardTitle>Keputusan Komite</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <FieldRow label="Plafond Disetujui" value={formatRupiah(app.approvedPlafond)} />
            <FieldRow label="Tenor Disetujui" value={`${app.approvedTenorMonths} bulan`} />
            <FieldRow label="Margin Disetujui" value={app.approvedMarginRate != null ? `${app.approvedMarginRate}%` : 'Tidak berlaku (bagi hasil)'} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Kepatuhan & Penilaian</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <section>
            <h3 className="font-semibold">Kepatuhan (AML)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Atestasi pemeriksaan DTTOT/PEP/negative-list eksternal — dicatat sebagai jejak audit.
            </p>
            <div className="mt-3">
              <AmlCompliance app={app} canAttest={canAttestAml} onAttest={attestAml} />
            </div>
          </section>
          <section>
            <h3 className="font-semibold">Penilaian Agunan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Jalur penilaian agunan (internal/KJPP) yang dipakai — dicatat untuk jejak audit dan menjadi prasyarat MUAP dikirim ke Risk.
            </p>
            <div className="mt-3">
              <AppraisalCompliance app={app} canRecord={canRecordAppraisal} onRecord={recordAppraisal} />
            </div>
          </section>
        </CardContent>
      </Card>
      <FinancialInputsCard app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />

        <Card>
          <CardHeader><CardTitle>Hasil Hard Gate</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <FieldRow label="DSR" value={app.financialsAssessed ? `${app.hardGates.dsr}%` : '-'} />
            <FieldRow label="LTV" value={app.financialsAssessed ? `${app.hardGates.ltv}%` : '-'} />
            {canEnterKol ? (
              <KolEntryRow app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
            ) : (
              <FieldRow label="Kol" value={app.kolEntered ? `Kol ${app.hardGates.kol}` : '-'} ocr={{ provenance: app.extractionSources?.['hardGates.kol'], docLabel: 'Laporan SLIK', onViewDoc: onViewDocuments }} />
            )}
            <BureauSummaryPanel
              app={app}
              onUpdate={onUpdate}
              canGenerate={canSummarizeBureau(actor, app)}
            />
          </CardContent>
        </Card>
      </div>
    </DossierSection>
  )
}

function FinancialInputsCard({ app, onUpdate, onViewDocuments }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void; onViewDocuments: () => void }) {
  const actor = useActor()
  // Do-it-early: the Analyst may fill financials from stage 1 up to & including stage 3.
  if (hasDesk(actor, 'muap-author') && app.stage <= 3) {
    return <FinancialInputsForm app={app} onUpdate={onUpdate} onViewDocuments={onViewDocuments} />
  }

  return (
    <Card>
      <CardHeader><CardTitle>Input Keuangan</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <OcrFieldRow app={app} label="Pendapatan Bersih/bln" fieldPath="financialInputs.netMonthlyIncome" provenance={app.extractionSources?.['financialInputs.netMonthlyIncome']} docLabel="Slip Gaji" onUpdate={onUpdate} onViewDocuments={onViewDocuments}>
          <span className="font-medium break-words">{formatRupiah(app.financialInputs.netMonthlyIncome)}</span>
        </OcrFieldRow>
        <FieldRow label="Kewajiban Cicilan Existing/bln" value={formatRupiah(app.financialInputs.existingMonthlyObligations)} />
        <OcrFieldRow app={app} label="Nilai Appraisal Agunan" fieldPath="financialInputs.collateralAppraisedValue" provenance={app.extractionSources?.['financialInputs.collateralAppraisedValue']} docLabel="Dokumen Appraisal" onUpdate={onUpdate} onViewDocuments={onViewDocuments}>
          <span className="font-medium break-words">{formatRupiah(app.financialInputs.collateralAppraisedValue)}</span>
        </OcrFieldRow>
        {akadConfig(app.akadType).usesMargin ? (
          <FieldRow label="Angsuran Pembiayaan/bln" value={formatRupiah(app.financialInputs.proposedMonthlyInstallment ?? 0)} />
        ) : (
          <FieldRow label="Estimasi Bagi Hasil/bln" value={formatRupiah(app.financialInputs.projectedMonthlyProfitShare ?? 0)} />
        )}
        {akadConfig(app.akadType).usesNisbah && (
          <>
            <FieldRow label="Nisbah Bagi Hasil (Bank:Nasabah)" value={app.financialInputs.nisbahBankPercent != null && app.financialInputs.nisbahCustomerPercent != null ? `${app.financialInputs.nisbahBankPercent} : ${app.financialInputs.nisbahCustomerPercent}` : 'Belum diisi'} />
            <FieldRow label="Dasar Proyeksi Bagi Hasil" value={app.financialInputs.projectionBasis?.trim() || 'Belum diisi'} />
          </>
        )}
        <FieldRow label={`${akadConfig(app.akadType).usesMargin ? akadConfig(app.akadType).returnLabel.replace(/^\w/, (c) => c.toUpperCase()) : 'Margin'}`} value={app.marginRate != null ? `${app.marginRate}%` : 'Tidak berlaku (bagi hasil)'} />
      </CardContent>
    </Card>
  )
}

function FinancialInputsForm({ app, onUpdate, onViewDocuments }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void; onViewDocuments: () => void }) {
  const cfg = akadConfig(app.akadType)
  const isFlatAkad = cfg.usesMargin
  const [netMonthlyIncome, setNetMonthlyIncome] = useState(app.financialInputs.netMonthlyIncome)
  const [existingMonthlyObligations, setExistingMonthlyObligations] = useState(app.financialInputs.existingMonthlyObligations)
  const [projectedMonthlyProfitShare, setProjectedMonthlyProfitShare] = useState(app.financialInputs.projectedMonthlyProfitShare ?? 0)
  const [collateralAppraisedValue, setCollateralAppraisedValue] = useState(app.financialInputs.collateralAppraisedValue)
  const [marginRate, setMarginRate] = useState(app.marginRate ?? 0)
  const [nisbahBank, setNisbahBank] = useState(app.financialInputs.nisbahBankPercent ?? 40)
  const [projectionBasis, setProjectionBasis] = useState(app.financialInputs.projectionBasis ?? '')
  const [incomeProvenance, setIncomeProvenance] = useState<ExtractionSource | undefined>(app.extractionSources?.['financialInputs.netMonthlyIncome'])
  const [collateralProvenance, setCollateralProvenance] = useState<ExtractionSource | undefined>(app.extractionSources?.['financialInputs.collateralAppraisedValue'])

  const nisbahCustomer = 100 - nisbahBank
  // Preview ONLY — the server recomputes DSR/LTV/installment authoritatively on save
  // (same fn, no drift). Hard-gate numbers are never trusted from the client.
  const { dsr, ltv, installment } = computeHardGates({
    requestedPlafond: app.requestedPlafond,
    requestedTenorMonths: app.requestedTenorMonths,
    akadType: app.akadType,
    netMonthlyIncome,
    existingMonthlyObligations,
    collateralAppraisedValue,
    projectedMonthlyProfitShare,
    marginRate,
  })


  async function save() {
    await runAction(() => saveFinancialsAction(app.id, {
      netMonthlyIncome,
      existingMonthlyObligations,
      collateralAppraisedValue,
      projectedMonthlyProfitShare: isFlatAkad ? null : projectedMonthlyProfitShare,
      marginRate: isFlatAkad ? marginRate : null,
      nisbahBankPercent: isFlatAkad ? null : nisbahBank,
      nisbahCustomerPercent: isFlatAkad ? null : nisbahCustomer,
      projectionBasis: isFlatAkad ? undefined : projectionBasis.trim(),
      incomeProvenance,
      collateralProvenance,
    }), onUpdate)
  }

  return (
    <Card>
      <CardHeader><CardTitle>Input Keuangan</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <OcrFieldRow app={app} label="Pendapatan Bersih/bln" fieldPath="financialInputs.netMonthlyIncome" provenance={incomeProvenance} docLabel="Slip Gaji" onUpdate={onUpdate} onViewDocuments={onViewDocuments} onConfirmed={() => setIncomeProvenance('ocr_confirmed')}>
          <Input className="max-w-xs" type="number" value={netMonthlyIncome} onChange={(e) => { setNetMonthlyIncome(Number(e.target.value)); if (incomeProvenance === 'ocr_suggested' || incomeProvenance === 'ocr_confirmed') setIncomeProvenance('ocr_overridden') }} />
        </OcrFieldRow>
        <EditablePlainRow label="Kewajiban Cicilan Existing/bln"><Input className="max-w-xs" type="number" value={existingMonthlyObligations} onChange={(e) => setExistingMonthlyObligations(Number(e.target.value))} /></EditablePlainRow>
        {isFlatAkad ? (
          <>
            <EditablePlainRow label="Tenor"><span className="font-medium">{app.requestedTenorMonths} bulan</span></EditablePlainRow>
            <EditablePlainRow label={cfg.returnRateLabel}><Input className="max-w-xs" type="number" value={marginRate} onChange={(e) => setMarginRate(Number(e.target.value))} /></EditablePlainRow>
            <EditablePlainRow label="Angsuran/bln"><span className="font-medium">{formatRupiah(installment)}</span></EditablePlainRow>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-violet-900">{cfg.returnRateLabel}</span>
                <div className="flex items-center gap-2">
                  <Input className="w-20" type="number" min={0} max={100} value={nisbahBank} onChange={(e) => setNisbahBank(Math.max(0, Math.min(100, Number(e.target.value))))} />
                  <span className="text-xs text-muted-foreground">% Bank</span>
                </div>
              </div>
              {/* Proportion bar — bank vs nasabah profit split */}
              <div className="mt-3 flex h-7 overflow-hidden rounded-md text-[11px] font-semibold text-white">
                <div className="flex items-center justify-center bg-violet-600 tabular-nums transition-[width] duration-300" style={{ width: `${nisbahBank}%` }}>{nisbahBank >= 12 ? `Bank ${nisbahBank}%` : ''}</div>
                <div className="flex items-center justify-center bg-violet-300 tabular-nums text-violet-900 transition-[width] duration-300" style={{ width: `${nisbahCustomer}%` }}>{nisbahCustomer >= 12 ? `Nasabah ${nisbahCustomer}%` : ''}</div>
              </div>
            </div>
            <EditablePlainRow label="Estimasi Bagi Hasil per Bulan">
              <div className="space-y-1">
                <Input className="max-w-xs" type="number" value={projectedMonthlyProfitShare} onChange={(e) => setProjectedMonthlyProfitShare(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Proyeksi bagi hasil bulanan nasabah — dasar perhitungan DSR untuk akad bagi hasil.</p>
              </div>
            </EditablePlainRow>
            <EditablePlainRow label="Dasar Proyeksi Bagi Hasil">
              <div className="w-full space-y-1">
                <textarea className="min-h-16 w-full rounded-md border px-3 py-2 text-sm" value={projectionBasis} onChange={(e) => setProjectionBasis(e.target.value)} placeholder="Mis. rata-rata laba bersih 6 bulan terakhir dari rekening koran usaha…" />
                <p className="text-xs text-muted-foreground">Wajib untuk akad bagi hasil — DSR-nya bersifat judgmental.</p>
              </div>
            </EditablePlainRow>
          </>
        )}
        <OcrFieldRow app={app} label="Nilai Appraisal Agunan" fieldPath="financialInputs.collateralAppraisedValue" provenance={collateralProvenance} docLabel="Dokumen Appraisal" onUpdate={onUpdate} onViewDocuments={onViewDocuments} onConfirmed={() => setCollateralProvenance('ocr_confirmed')}>
          <Input className="max-w-xs" type="number" value={collateralAppraisedValue} onChange={(e) => { setCollateralAppraisedValue(Number(e.target.value)); if (collateralProvenance === 'ocr_suggested' || collateralProvenance === 'ocr_confirmed') setCollateralProvenance('ocr_overridden') }} />
        </OcrFieldRow>
        <p className="text-sm text-muted-foreground">DSR (akan disimpan): {dsr}% · LTV (akan disimpan): {ltv}%</p>
        <Button type="button" onClick={save}>Simpan</Button>
      </CardContent>
    </Card>
  )
}

function EditablePlainRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <div className="shrink-0 text-muted-foreground sm:w-[220px]">{label}</div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

// ADVISORY OCR-widening (design §3) — READ-ONLY informational section. These figures are read from
// documents for context + cross-check; they NEVER gate anything (NIK stays the sole blocker), so the
// section has NO confirm/gate affordance — visually distinct from the gating OCR fields above (which
// keep their "Konfirmasi OCR" flow). A ⚠️ triangle (shape-coded warning, WCAG 1.4.1) marks a
// crossCheck.status === 'mismatch'. Bahasa.
function AdvisoryExtractionsCard({ app, onViewDocuments }: { app: LoanApplication; onViewDocuments: () => void }) {
  const entries = Object.entries(app.advisoryExtractions ?? {})
  if (entries.length === 0) return null

  const fmtValue = (value: string | number): string => {
    if (typeof value === 'number') {
      // Heuristic: small integers are counts (e.g. fasilitas aktif); larger numbers are Rupiah.
      return value > 0 && value < 1000 && Number.isInteger(value) ? String(value) : formatRupiah(value)
    }
    return value === '' ? '—' : String(value)
  }

  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Informasi tambahan dari dokumen (OCR)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Bersifat informatif &amp; pemeriksaan silang saja — tidak menjadi syarat/gerbang tahap. Nilai dari OCR; perlu verifikasi manual bila dipakai.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.map(([key, adv]) => {
          const mismatch = adv.crossCheck?.status === 'mismatch'
          return (
            <div key={key} className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
              <div className="flex shrink-0 items-center gap-1 text-muted-foreground sm:w-[220px]">
                {mismatch && <AlertTriangle className="size-4 text-warning-foreground" aria-hidden />}
                {adv.label}
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="font-medium break-words tabular-nums">{fmtValue(adv.value)}</span>
                {adv.docType && <span className="text-xs text-muted-foreground">({adv.docType})</span>}
                {adv.docType && (
                  <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onViewDocuments}>
                    Lihat dokumen ↗
                  </Button>
                )}
                {mismatch && adv.crossCheck?.note && (
                  <span className="w-full text-xs text-warning-foreground">{adv.crossCheck.note}</span>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function NikConfirmRow({ app, onUpdate, onViewDocuments }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void; onViewDocuments: () => void }) {
  const [nikInput, setNikInput] = useState(app.nik ?? '')

  async function confirmNik() {
    const trimmed = nikInput.trim()
    if (!trimmed) return
    // The server decides confirmed-vs-overridden, sets extractionSources, and audits.
    await runAction(() => confirmExtractedFieldAction(app.id, 'nik', trimmed), onUpdate)
  }

  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <div className="shrink-0 text-muted-foreground sm:w-[220px]">
        <AlertTriangle className="mr-1 inline size-4 text-warning-foreground" />
        NIK
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Input className="max-w-xs" value={nikInput} onChange={(event) => setNikInput(event.target.value)} />
        <Button type="button" size="sm" variant="outline" onClick={confirmNik} disabled={!nikInput.trim()}>Konfirmasi OCR</Button>
        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onViewDocuments}>Lihat KTP ↗</Button>
      </div>
    </div>
  )
}

function KolEntryRow({ app, onUpdate, onViewDocuments }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void; onViewDocuments: () => void }) {
  const slikUploaded = app.documents.some(d => d.docType === 'slik_report')
  // Prefill with the Kol stored at SLIK upload (the OCR suggestion, Slice 2b), else default 1.
  const [kolValue, setKolValue] = useState(String(Number(app.hardGates.kol ?? 1)))

  async function confirmKol() {
    // The server recomputes violations + the confirmed/overridden provenance and audits.
    await runAction(() => confirmKolAction(app.id, Number(kolValue)), onUpdate)
  }

  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <div className="shrink-0 text-muted-foreground sm:w-[220px]">
        {slikUploaded && <AlertTriangle className="mr-1 inline size-4 text-warning-foreground" />}
        Kol
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {!slikUploaded ? (
          <span className="text-muted-foreground">Unggah Laporan SLIK di tab Dokumen terlebih dahulu.</span>
        ) : (
          <>
            <Select value={kolValue} onValueChange={(value) => value && setKolValue(value)}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Kol 1</SelectItem>
                <SelectItem value="2">Kol 2</SelectItem>
                <SelectItem value="3">Kol 3</SelectItem>
                <SelectItem value="4">Kol 4</SelectItem>
                <SelectItem value="5">Kol 5</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={confirmKol}>Konfirmasi OCR</Button>
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onViewDocuments}>Lihat Laporan SLIK ↗</Button>
          </>
        )}
      </div>
    </div>
  )
}

// Generic confirm/correct row for string identity fields (NPWP, NIB, Alamat, Bidang Usaha).
// Mirrors NikConfirmRow: renders an input pre-filled from the app, plus "Konfirmasi OCR" + view-doc link.
// Used only when provenance === 'ocr_suggested' AND actor can work the intake desk now.
function IdentityConfirmRow({ fieldPath, label, docLabel, app, onUpdate, onViewDocuments }: {
  fieldPath: 'npwp' | 'nib' | 'alamat' | 'bidangUsaha'
  label: string
  docLabel: string
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  onViewDocuments: () => void
}) {
  const [inputValue, setInputValue] = useState(app[fieldPath] ?? '')

  async function confirm() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    await runAction(() => confirmExtractedFieldAction(app.id, fieldPath, trimmed), onUpdate)
  }

  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <div className="shrink-0 text-muted-foreground sm:w-[220px]">
        <AlertTriangle className="mr-1 inline size-4 text-warning-foreground" />
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Input className="max-w-xs" value={inputValue} onChange={(event) => setInputValue(event.target.value)} />
        <Button type="button" size="sm" variant="outline" onClick={confirm} disabled={!inputValue.trim()}>Konfirmasi OCR</Button>
        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onViewDocuments}>Lihat {docLabel} ↗</Button>
      </div>
    </div>
  )
}

function FieldRow({ label, value, ocr }: { label: string; value: string; ocr?: OcrMeta }) {
  const needsConfirmation = ocr?.provenance === 'ocr_suggested'

  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <div className="shrink-0 text-muted-foreground sm:w-[220px]">
        {needsConfirmation && <AlertTriangle className="mr-1 inline size-4 text-warning-foreground" />}
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="font-medium break-words">{value}</span>
        {ocr && <ProvenanceBadge provenance={ocr.provenance} />}
        {ocr && (
          <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={ocr.onViewDoc}>
            Lihat {ocr.docLabel} ↗
          </Button>
        )}
      </div>
    </div>
  )
}

// AI bureau-bundle summary (SLIK + Pefindo + Rek Koran). ADVISORY ONLY — labelled non-authoritative;
// Kol + all gating values stay human-confirmed. Generation is masked + audited (server/ai/bureau.ts).
function BureauSummaryPanel({
  app,
  onUpdate,
  canGenerate,
}: {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  canGenerate: boolean
}) {
  const summary = app.bureauSummary
  const hasSlik = app.documents.some((d) => d.docType === 'slik_report')
  if (!summary && !canGenerate) return null

  async function generate() {
    await runAction(
      () => generateBureauSummaryAction(app.id),
      (fresh) => {
        onUpdate(fresh)
        toast.success('Ringkasan biro dibuat.')
      },
    )
  }

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ringkasan Biro (AI) · Advisory</p>
        {canGenerate && (
          <Button type="button" size="sm" variant="outline" onClick={generate} disabled={!hasSlik}>
            {summary ? 'Perbarui ringkasan' : 'Buat ringkasan biro'}
          </Button>
        )}
      </div>
      {summary ? (
        <>
          <p className="mt-2 whitespace-pre-line text-sm">{summary.summary}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Oleh {summary.generatedByName} ·{' '}
            {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(summary.generatedAt))} · {summary.model} · Bukan keputusan; Kol & angka tetap dikonfirmasi manusia.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {hasSlik
            ? 'Belum ada ringkasan. Buat ringkasan faktual dari data biro (SLIK/Pefindo/Rekening Koran) untuk telaah.'
            : 'Unggah Laporan SLIK terlebih dahulu.'}
        </p>
      )}
    </div>
  )
}

const AKAD_OPTIONS: LoanApplication['akadType'][] = ['Murabahah', 'Ijarah', 'Musyarakah', 'Mudharabah']

/// Pre-Komite proposal revision (negotiation). RM-only, hidden once the Komite has decided. Edits
/// the requested terms + akad and calls reviseProposalAction, which recomputes the hard gates and
/// (if a finalized MUAP/RSK exists) cascades a chain reset + regression. See workflow-engine.md.
function ReviseProposalControl({ app, onUpdate }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void }) {
  const actor = useActor()
  const [open, setOpen] = useState(false)
  const [plafond, setPlafond] = useState(app.requestedPlafond)
  const [tenor, setTenor] = useState(app.requestedTenorMonths)
  const [margin, setMargin] = useState(app.marginRate ?? 0)
  const [akad, setAkad] = useState<LoanApplication['akadType']>(app.akadType)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (!hasDesk(actor, 'intake') || !isPreKomite(app)) return null

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Revisi proposal
      </Button>
    )
  }

  const flat = akadConfig(akad).usesMargin
  async function submit() {
    setBusy(true)
    try {
      const rev: ProposalRevision = {
        requestedPlafond: plafond,
        requestedTenorMonths: tenor,
        akadType: akad,
        marginRate: flat ? margin : null,
      }
      await runAction(() => reviseProposalAction(app.id, rev, reason), onUpdate)
      setOpen(false)
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-background/60 p-3">
      <p className="text-sm font-medium">Revisi proposal — negosiasi pra-Komite</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Plafond
          <Input type="number" value={plafond} onChange={(e) => setPlafond(Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          Tenor (bulan)
          <Input type="number" value={tenor} onChange={(e) => setTenor(Number(e.target.value))} />
        </label>
        <label className="block text-sm">
          Jenis Akad
          <Select value={akad} onValueChange={(v) => setAkad(v as LoanApplication['akadType'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AKAD_OPTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {flat && (
          <label className="block text-sm">
            Margin (% / tahun)
            <Input type="number" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
          </label>
        )}
      </div>
      <label className="block text-sm">
        Alasan revisi (wajib — jejak audit)
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. counter-offer bank: plafond diturunkan" />
      </label>
      <p className="text-xs text-muted-foreground">
        Menghitung ulang hard gate; bila MUAP/RSK sudah final, keduanya dibatalkan untuk disusun ulang (kembali ke tahap MUAP).
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={!reason.trim() || busy} onClick={submit}>
          Simpan revisi
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </div>
  )
}

/// RM withdraws the application before disbursement (nasabah backs out / bank declines). Destructive
/// terminal close — gated to active, not-yet-disbursed apps; reason mandatory. See withdrawApplicationAction.
function WithdrawControl({ app, onUpdate }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void }) {
  const actor = useActor()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (!hasDesk(actor, 'intake') || app.applicationStatus === 'closed' || app.disbursementStatus === 'Cair') return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline-offset-2 hover:text-danger hover:underline"
      >
        Tarik pengajuan
      </button>
    )
  }

  async function submit() {
    setBusy(true)
    try {
      await runAction(() => withdrawApplicationAction(app.id, reason), onUpdate)
      setOpen(false)
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-subtle/40 p-3">
      <p className="text-sm font-medium text-danger-foreground">Tarik pengajuan — penutupan permanen</p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan penarikan (wajib — jejak audit)" />
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={!reason.trim() || busy} onClick={submit}>
          Tarik pengajuan
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </div>
  )
}
