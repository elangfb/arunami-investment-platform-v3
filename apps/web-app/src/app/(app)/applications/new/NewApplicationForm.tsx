'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  Building2,
  Heart,
  Loader2,
  Lock,
  ShieldCheck,
  Store,
  User,
  UserCheck,
  UserRound,
} from 'lucide-react'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { createApplicationAction } from '@/server/actions/application-create'
import { checkCustomerDedupAction } from '@/server/actions/customer-read'
import type { CustomerDedupMatch } from '@/server/repo/customer'
import { CustomerDedupNudge } from '@/components/applications/CustomerDedupNudge'
import type { AkadType, CollateralType, IncomeSource } from '@/lib/types'
import { Page } from '@/components/layout/Page'
import { FormSection, Field, SegmentedToggle } from '@/components/ui/form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const TENOR_PRESETS = [12, 24, 36, 48, 60]

// Base UI's Select.Root re-syncs its label store on the `items` IDENTITY, so these
// must be stable module constants — an inline literal is a new reference every
// render and loops ("Maximum update depth exceeded"). See apps CLAUDE.md.
const AKAD_ITEMS = {
  Murabahah: 'Murabahah',
  Musyarakah: 'Musyarakah',
  Ijarah: 'Ijarah',
  Mudharabah: 'Mudharabah',
} as const

const COLLATERAL_ITEMS = {
  none: 'Tanpa Agunan',
  fixed_asset: 'Properti / Tanah',
  vehicle: 'Kendaraan',
  guarantor: 'Jaminan Perorangan',
} as const

const groupDigits = (value: string) =>
  value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const revealField = 'animate-in fade-in slide-in-from-top-1 duration-200'

export function NewApplicationForm({ customerId }: { customerId?: string }) {
  const router = useRouter()
  const actor = useActor()
  const [nasabahName, setNasabahName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(true)
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [namaUsaha, setNamaUsaha] = useState('')
  const [nasabahType, setNasabahType] = useState<'individual' | 'business'>('individual')
  const [akadType, setAkadType] = useState<AkadType>('Murabahah')
  const [collateralType, setCollateralType] = useState<CollateralType>('none')
  const [incomeSource, setIncomeSource] = useState<IncomeSource>('karyawan')
  const [isMarried, setIsMarried] = useState(false)
  const [plafond, setPlafond] = useState('')
  const [tenorMonths, setTenorMonths] = useState(12)
  const [purpose, setPurpose] = useState('')
  // Legal-identity fields (optional at intake; OCR will suggest from uploaded docs).
  const [nik, setNik] = useState('')
  const [npwp, setNpwp] = useState('')
  const [alamat, setAlamat] = useState('')
  const [nib, setNib] = useState('')
  const [bidangUsaha, setBidangUsaha] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Create-time SOFT dedup nudge (ADR-0020 §2). Debounced probe on the identity key the RM types
  // (individual → NIK, business → NPWP/NIB); advisory only, never blocks submit. A monotonic seq
  // guard drops stale async responses so a slower earlier request can't overwrite a newer one.
  // Skipped entirely when the link-direct customerId prefill is present (we already know the file).
  const [dedupMatches, setDedupMatches] = useState<CustomerDedupMatch[]>([])
  const dedupSeq = useRef(0)
  const dedupKey = nasabahType === 'individual' ? nik.trim() : `${npwp.trim()}|${nib.trim()}`
  useEffect(() => {
    // Bump the seq on every change so any in-flight request is invalidated (its late response is
    // dropped by the seq check below) — this is how we "clear" stale matches without a synchronous
    // setState in the effect body. Skip the probe entirely under link-direct prefill.
    const seq = ++dedupSeq.current
    if (customerId) return
    // Only fire when the type's identity key is non-empty: individuals key on NIK, business on
    // NPWP (NIB secondary). NIK is optional at intake (OCR fills it later), so the individual nudge
    // only fires once the RM enters it manually.
    const hasKey =
      nasabahType === 'individual'
        ? nik.trim() !== ''
        : npwp.trim() !== '' || nib.trim() !== ''
    const handle = setTimeout(async () => {
      const matches = hasKey
        ? await checkCustomerDedupAction(
            nasabahType === 'individual'
              ? { type: nasabahType, nik: nik.trim() || undefined }
              : { type: nasabahType, npwp: npwp.trim() || undefined, nib: nib.trim() || undefined },
          ).catch(() => [] as CustomerDedupMatch[])
        : []
      // Ignore stale responses: only the latest-issued query may commit.
      if (seq === dedupSeq.current) setDedupMatches(matches)
    }, hasKey ? 400 : 0)
    return () => clearTimeout(handle)
    // dedupKey collapses the watched identity fields into one stable trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupKey, nasabahType, customerId])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!nasabahName.trim() || !phoneNumber.trim() || !nasabahType || !akadType || !plafond || !purpose.trim() || (nasabahType === 'business' && !namaUsaha.trim())) {
      toast.error('Lengkapi semua field wajib')
      return
    }

    const wa = (whatsappSameAsPhone ? phoneNumber : whatsappNumber).trim()
    setIsSubmitting(true)
    try {
      await createApplicationAction({
        nasabahName,
        nasabahType,
        phoneNumber,
        whatsappNumber: wa,
        namaUsaha,
        nik,
        npwp,
        alamat,
        nib,
        bidangUsaha,
        akadType,
        collateralType,
        incomeSource,
        isMarried,
        requestedPlafond: Number(plafond),
        requestedTenorMonths: tenorMonths,
        purpose,
        // Link-direct (ADR-0020 §2): when launched from an existing Nasabah file, link THAT
        // Customer exactly (no dedup fork), even if the intake identity key is blank/differing.
        ...(customerId ? { customerId } : {}),
      })
      toast.success('Aplikasi baru berhasil dibuat')
      router.push('/pipeline')
    } catch (e) {
      console.error(e)
      toast.error('Gagal membuat aplikasi. Coba lagi.')
      setIsSubmitting(false)
    }
  }

  return (
    <Page.Root className="mx-auto max-w-4xl">
      <Page.Header
        eyebrow="Relationship Manager"
        title="Buat Aplikasi Pembiayaan"
        description="Lengkapi data pengajuan untuk memulai proses pembiayaan."
      >
        <Button type="button" variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Kembali
        </Button>
      </Page.Header>

      {!hasDesk(actor, 'intake') ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-card px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="font-heading text-lg font-semibold">Akses Ditolak</h2>
            <p className="text-sm text-muted-foreground">
              Hanya Relationship Manager yang dapat membuat aplikasi baru.
            </p>
          </div>
          <Button type="button" onClick={() => router.back()}>
            <ArrowLeft className="size-4" />
            Kembali
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="stagger space-y-5">
          {customerId && (
            <div className="flex items-center gap-2 rounded-md border border-info/20 bg-info-subtle/50 px-3 py-2 text-sm text-info-foreground">
              <UserCheck className="size-4 shrink-0" aria-hidden />
              <span>Pengajuan untuk nasabah terdaftar — pengajuan baru akan ditautkan ke file nasabah ini.</span>
            </div>
          )}

          {/* ── Identitas Nasabah ─────────────────────────────── */}
          <FormSection
            icon={UserRound}
            title="Identitas Nasabah"
            description="Data calon nasabah dan kontak yang dapat dihubungi."
          >
            <Field label="Jenis Nasabah" required full>
              <SegmentedToggle
                value={nasabahType}
                onChange={setNasabahType}
                options={[
                  { value: 'individual', label: 'Individu', icon: User },
                  { value: 'business', label: 'Bisnis', icon: Building2 },
                ]}
              />
            </Field>

            <Field label="Nama Nasabah" htmlFor="nasabahName" required>
              <Input
                id="nasabahName"
                value={nasabahName}
                onChange={(event) => setNasabahName(event.target.value)}
                placeholder="Nama lengkap sesuai KTP"
                required
              />
            </Field>

            {nasabahType === 'business' && (
              <Field label="Nama Usaha" htmlFor="namaUsaha" required className={revealField}>
                <Input
                  id="namaUsaha"
                  value={namaUsaha}
                  onChange={(event) => setNamaUsaha(event.target.value)}
                  placeholder="Nama badan usaha"
                  required
                />
              </Field>
            )}

            <Field label="No. Telepon" htmlFor="phoneNumber" required>
              <Input
                id="phoneNumber"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="08xx-xxxx-xxxx"
                required
              />
            </Field>

            {!whatsappSameAsPhone && (
              <Field label="Nomor WhatsApp" htmlFor="whatsappNumber" className={revealField}>
                <Input
                  id="whatsappNumber"
                  value={whatsappNumber}
                  onChange={(event) => setWhatsappNumber(event.target.value)}
                  placeholder="08xx-xxxx-xxxx"
                />
              </Field>
            )}

            <label
              htmlFor="whatsappSameAsPhone"
              className="flex cursor-pointer items-center gap-2 self-end pb-1 text-sm text-muted-foreground sm:col-span-2"
            >
              <input
                id="whatsappSameAsPhone"
                type="checkbox"
                className="size-4 accent-primary"
                checked={whatsappSameAsPhone}
                onChange={(event) => setWhatsappSameAsPhone(event.target.checked)}
              />
              Nomor WhatsApp sama dengan nomor telepon
            </label>

            {nasabahType === 'individual' && (
              <>
                <Field label="Sumber Penghasilan" required className={revealField}>
                  <SegmentedToggle
                    value={incomeSource}
                    onChange={setIncomeSource}
                    options={[
                      { value: 'karyawan', label: 'Karyawan', icon: Briefcase },
                      { value: 'wiraswasta', label: 'Wiraswasta', icon: Store },
                    ]}
                  />
                </Field>

                <Field label="Status Pernikahan" required className={revealField}>
                  <SegmentedToggle
                    value={isMarried ? 'true' : 'false'}
                    onChange={(value) => setIsMarried(value === 'true')}
                    options={[
                      { value: 'false', label: 'Belum Menikah' },
                      { value: 'true', label: 'Sudah Menikah', icon: Heart },
                    ]}
                  />
                </Field>
              </>
            )}

            {/* ── Identitas Hukum (opsional — OCR akan menyarankan dari dokumen) ── */}
            <div className="col-span-full text-sm font-medium text-muted-foreground pt-1">
              Identitas Hukum <span className="text-xs font-normal">(opsional — dapat diisi dari dokumen yang diunggah)</span>
            </div>

            {nasabahType === 'individual' && (
              <Field label="NIK" htmlFor="nik" className={revealField} hint="Mengisi NIK di awal membantu mengenali nasabah yang sudah terdaftar.">
                <Input
                  id="nik"
                  inputMode="numeric"
                  value={nik}
                  onChange={(event) => setNik(event.target.value.replace(/\D/g, ''))}
                  placeholder="16 digit sesuai KTP"
                  maxLength={16}
                />
              </Field>
            )}

            <Field label="NPWP" htmlFor="npwp">
              <Input
                id="npwp"
                value={npwp}
                onChange={(event) => setNpwp(event.target.value)}
                placeholder="xx.xxx.xxx.x-xxx.xxx"
              />
            </Field>

            <Field label="Alamat Legalitas" htmlFor="alamat">
              <Input
                id="alamat"
                value={alamat}
                onChange={(event) => setAlamat(event.target.value)}
                placeholder="Alamat sesuai dokumen legalitas"
              />
            </Field>

            {nasabahType === 'business' && (
              <Field label="NIB" htmlFor="nib" className={revealField}>
                <Input
                  id="nib"
                  value={nib}
                  onChange={(event) => setNib(event.target.value)}
                  placeholder="Nomor Induk Berusaha"
                />
              </Field>
            )}

            {nasabahType === 'business' && (
              <Field label="Bidang Usaha" htmlFor="bidangUsaha" className={revealField}>
                <Input
                  id="bidangUsaha"
                  value={bidangUsaha}
                  onChange={(event) => setBidangUsaha(event.target.value)}
                  placeholder="Mis. perdagangan umum, konstruksi, dll."
                />
              </Field>
            )}

            {/* Soft dedup nudge — advisory, non-blocking (ADR-0020 §2). Renders nothing when empty. */}
            <CustomerDedupNudge
              matches={dedupMatches.map((m) => ({
                id: m.id,
                label: m.label,
                applicationCount: m.applicationCount,
              }))}
            />
          </FormSection>

          {/* ── Detail Pembiayaan ─────────────────────────────── */}
          <FormSection
            icon={Banknote}
            title="Detail Pembiayaan"
            description="Skema akad, plafond, dan jangka waktu yang diajukan."
          >
            <Field label="Jenis Akad" htmlFor="akadType" required>
              <Select
                value={akadType}
                onValueChange={(value) => setAkadType(value as AkadType)}
                items={AKAD_ITEMS}
                required
              >
                <SelectTrigger id="akadType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Murabahah">Murabahah</SelectItem>
                  <SelectItem value="Musyarakah">Musyarakah</SelectItem>
                  <SelectItem value="Ijarah">Ijarah</SelectItem>
                  <SelectItem value="Mudharabah">Mudharabah</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Plafond" htmlFor="plafond" required>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="plafond"
                  inputMode="numeric"
                  className="tabular pl-9"
                  placeholder="500.000.000"
                  value={groupDigits(plafond)}
                  onChange={(event) => setPlafond(event.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </Field>

            <Field
              label="Tenor"
              htmlFor="tenorMonths"
              required
              hint="Jangka waktu pembiayaan dalam bulan."
            >
              <Input
                id="tenorMonths"
                type="number"
                min={1}
                className="tabular"
                value={tenorMonths}
                onChange={(event) => setTenorMonths(Number(event.target.value))}
                required
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TENOR_PRESETS.map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setTenorMonths(months)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-xs transition-colors',
                      tenorMonths === months
                        ? 'border-primary bg-accent font-medium text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {months} bln
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Tujuan Pembiayaan" htmlFor="purpose" required full>
              <Textarea
                id="purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Mis. modal kerja untuk pengadaan stok barang dagangan."
                rows={3}
                required
              />
            </Field>
          </FormSection>

          {/* ── Agunan ────────────────────────────────────────── */}
          <FormSection
            icon={ShieldCheck}
            title="Agunan"
            description="Jaminan yang menyertai pengajuan pembiayaan ini."
          >
            <Field label="Jenis Agunan" htmlFor="collateralType" required full>
              <Select
                value={collateralType}
                onValueChange={(value) => setCollateralType(value as CollateralType)}
                items={COLLATERAL_ITEMS}
                required
              >
                <SelectTrigger id="collateralType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa Agunan</SelectItem>
                  <SelectItem value="fixed_asset">Properti / Tanah</SelectItem>
                  <SelectItem value="vehicle">Kendaraan</SelectItem>
                  <SelectItem value="guarantor">Jaminan Perorangan</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FormSection>

          <Page.ActionBar>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isSubmitting ? 'Membuat…' : 'Buat Aplikasi'}
            </Button>
          </Page.ActionBar>
        </form>
      )}
    </Page.Root>
  )
}
