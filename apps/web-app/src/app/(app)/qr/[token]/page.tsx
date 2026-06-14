import Link from 'next/link'
import { ShieldCheck, ShieldX } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusChip } from '@/components/shared/StatusChip'
import { verifyQrToken } from '@/server/repo/approval'
import { APPROVAL_ROLE_LABEL } from '@/lib/approval-desks'

// QR signature verification — the internal, auth-walled page a scanned Mizan QR resolves to
// (it lives in the (app) group, so the session gate applies). The token is opaque + carries no
// PII; this page turns it back into "who signed what, and when". A signed-doc QR stays scannable
// forever (the ApprovalStep ledger is append-only), so this never expires.

const CHAIN_LABEL: Record<'muap' | 'rsk', string> = { muap: 'MUAP', rsk: 'RSK' }
// MoM signatures (chain='mom', role='komite-signer') reuse this verify page (ADR-0005).
const chainLabel = (c: string): string => (c === 'mom' ? 'MoM Komite' : CHAIN_LABEL[c as 'muap' | 'rsk'])
// Fallback to the raw role string for any ledger row whose role is no longer in the label map
// (e.g. a pre-2026.06.12 row signed under a removed rung on a not-yet-reseeded DB) — never render "undefined".
const roleLabel = (r: string): string =>
  r === 'komite-signer' ? 'Anggota Komite' : (APPROVAL_ROLE_LABEL[r as keyof typeof APPROVAL_ROLE_LABEL] ?? r)

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'tabular font-medium' : 'font-medium'}>{value}</span>
    </div>
  )
}

export default async function QrVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = await verifyQrToken(token)

  if (!v) {
    return (
      <Page.Root className="mx-auto max-w-xl">
        <Page.Header eyebrow="Verifikasi Tanda Tangan" title="QR tidak dikenali" />
        <Card>
          <CardContent className="flex items-start gap-3 py-6">
            <ShieldX className="size-6 shrink-0 text-danger" aria-hidden />
            <div className="space-y-2">
              <StatusChip tone="danger" label="Tidak sah" icon={ShieldX} />
              <p className="text-sm text-muted-foreground">
                Token QR ini tidak cocok dengan tanda tangan mana pun di Mizan. Pastikan QR
                dipindai dari dokumen Hijra yang sah.
              </p>
            </div>
          </CardContent>
        </Card>
      </Page.Root>
    )
  }

  const { step, applicationId, nasabahName } = v
  const when = new Date(step.createdAt).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })

  return (
    <Page.Root className="mx-auto max-w-xl">
      <Page.Header eyebrow="Verifikasi Tanda Tangan" title={`Tanda tangan ${chainLabel(step.chain)}`} />
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-success" aria-hidden />
            Tanda tangan sah
            <StatusChip tone="success" label="Terverifikasi" icon={ShieldCheck} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Penanda tangan" value={step.userName} />
          <Row label="Peran" value={roleLabel(step.role)} />
          <Row label="Dokumen" value={`${chainLabel(step.chain)} · ${nasabahName}`} />
          <Row label="Aplikasi" value={applicationId} mono />
          <Row label="Waktu tanda tangan" value={when} />
          <Link
            href={step.chain === 'mom' ? `/applications/${applicationId}/komite` : `/applications/${applicationId}?view=${step.chain}`}
            className="mt-2 inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Buka aplikasi
          </Link>
        </CardContent>
      </Card>
    </Page.Root>
  )
}
