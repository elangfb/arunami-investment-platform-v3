'use client'

import Link from 'next/link'
import { Building2, FileText, IdCard, PlusCircle, User } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ApplicationCard } from '@/components/kanban/ApplicationCard'
import { CatatanKonteksEditor } from '@/components/ai-context/CatatanKonteksEditor'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { updateCustomerContextAction } from '@/server/actions/ai-context'
import type { Customer } from '@/server/repo/customer'
import type { LoanApplication } from '@/lib/types'

// Nasabah (Customer) file view — read-open to any authenticated actor (mirrors /applications);
// the "Pengajuan Baru" carry-forward CTA is the only intake-gated affordance (ADR-0020 §2).

/** One label/value row in the identity grid. Identity numbers render in font-mono. */
function IdentityRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-sm text-foreground' : 'text-sm text-foreground'}>{value}</dd>
    </div>
  )
}

export function NasabahDetailClient({
  customer,
  applications,
}: {
  customer: Customer
  applications: LoanApplication[]
}) {
  const actor = useActor()
  const isBusiness = customer.type === 'business'
  const displayName =
    (isBusiness ? customer.namaUsaha : customer.nama) || customer.nama || customer.namaUsaha || customer.id

  // Only the identity fields present for this customer type, in display order.
  const rows: { label: string; value: string; mono?: boolean }[] = []
  if (isBusiness) {
    if (customer.namaUsaha) rows.push({ label: 'Nama Usaha', value: customer.namaUsaha })
    if (customer.nama) rows.push({ label: 'Nama Penanggung Jawab', value: customer.nama })
    if (customer.npwp) rows.push({ label: 'NPWP', value: customer.npwp, mono: true })
    if (customer.nib) rows.push({ label: 'NIB', value: customer.nib, mono: true })
    if (customer.bidangUsaha) rows.push({ label: 'Bidang Usaha', value: customer.bidangUsaha })
  } else {
    if (customer.nama) rows.push({ label: 'Nama Nasabah', value: customer.nama })
    if (customer.nik) rows.push({ label: 'NIK', value: customer.nik, mono: true })
    if (customer.npwp) rows.push({ label: 'NPWP', value: customer.npwp, mono: true })
    if (customer.isMarried != null)
      rows.push({ label: 'Status Pernikahan', value: customer.isMarried ? 'Sudah Menikah' : 'Belum Menikah' })
    if (customer.incomeSource)
      rows.push({
        label: 'Sumber Penghasilan',
        value: customer.incomeSource === 'karyawan' ? 'Karyawan' : customer.incomeSource === 'wiraswasta' ? 'Wiraswasta' : customer.incomeSource,
      })
  }
  // Shared fields (present for either type).
  if (customer.alamat) rows.push({ label: 'Alamat', value: customer.alamat })
  if (customer.phoneNumber) rows.push({ label: 'No. Telepon', value: customer.phoneNumber, mono: true })
  if (customer.whatsappNumber) rows.push({ label: 'No. WhatsApp', value: customer.whatsappNumber, mono: true })

  return (
    <Page.Root>
      <Page.Header eyebrow="Nasabah" title={displayName}>
        <Badge variant="secondary" className="gap-1">
          {isBusiness ? <Building2 className="size-3" /> : <User className="size-3" />}
          {isBusiness ? 'Bisnis' : 'Individu'}
        </Badge>
        {hasDesk(actor, 'intake') && (
          <Link href={`/applications/new?customerId=${customer.id}`}>
            <Button>
              <PlusCircle className="mr-2 size-4" />
              Pengajuan Baru
            </Button>
          </Link>
        )}
      </Page.Header>

      {/* ── Identitas ─────────────────────────────── */}
      <section className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-primary/10">
            <IdCard className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-base font-semibold leading-snug text-foreground">Identitas</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Data identitas nasabah pada berkas ini.</p>
          </div>
        </div>
        {rows.length > 0 ? (
          <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            {rows.map((r) => (
              <IdentityRow key={r.label} label={r.label} value={r.value} mono={r.mono} />
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada data identitas.</p>
        )}
      </section>

      {/* ── Catatan Nasabah (konteks AI) ─────────────
          The Nasabah-scoped human "Catatan" (Customer.contextMd) — additive free-text injected into
          the AI context broad→narrow (RM-led redesign §5 / Topic 5). Open to any participant; the
          server action attributes the write. The AUTO derived block is APP-scoped (shown on each
          pengajuan detail), so there is no auto block to preview at the Nasabah level. */}
      <CatatanKonteksEditor
        title="Catatan Nasabah (konteks AI)"
        description="Catatan tetap nasabah yang ikut dibaca asisten AI di setiap pengajuan. Konteks otomatis per-pengajuan tampil di halaman pengajuan."
        autoBlock=""
        initialCatatan={customer.contextMd ?? null}
        placeholder="Mis. profil usaha, relasi grup, preferensi akad, atau catatan penting yang berlaku lintas pengajuan nasabah ini…"
        onSave={(catatan) => updateCustomerContextAction(customer.id, catatan)}
      />

      {/* ── Pengajuan ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-heading text-base font-semibold leading-snug text-foreground">Pengajuan</h2>
        {applications.length > 0 ? (
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {applications.map((app) => (
              <ApplicationCard key={app.id} app={app} showDate />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Belum ada pengajuan"
            description="Nasabah ini belum memiliki pengajuan pembiayaan."
          />
        )}
      </section>
    </Page.Root>
  )
}
