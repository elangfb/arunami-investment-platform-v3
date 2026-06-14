import { Wallet, ShieldAlert, CheckCircle2, Eye } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { StatCard } from '@/components/shared/StatCard'
import { StatusChip } from '@/components/shared/StatusChip'
import { Card, CardContent } from '@/components/ui/card'
import { WatchlistTable, type WatchlistRow } from '@/components/portofolio/WatchlistTable'
import { formatRupiah } from '@/lib/sla-utils'
import { cn } from '@/lib/utils'
import { listApplications } from '@/server/repo'

const NPL_THRESHOLD = 5 // OJK healthy-book ceiling, %

export default async function PortofolioPage() {
  const applications = await listApplications()
  const disbursedLoans = applications.filter((app) => app.stage === 6 && app.disbursementStatus === 'Cair').map(
    (app, index) => {
      const plafond = app.approvedPlafond ?? app.requestedPlafond
      const outstanding = Math.round(plafond * 0.9)
      const dueDate = new Date(2026, 6 + index, 15)
      return { app, plafond, outstanding, kol: app.hardGates.kol, dueDate }
    },
  )

  const totalOutstanding = disbursedLoans.reduce((sum, row) => sum + row.outstanding, 0)
  const performingOut = disbursedLoans.filter((r) => r.kol === 1).reduce((s, r) => s + r.outstanding, 0)
  const watchOut = disbursedLoans.filter((r) => r.kol === 2).reduce((s, r) => s + r.outstanding, 0)
  const nplOut = disbursedLoans.filter((r) => r.kol >= 3).reduce((s, r) => s + r.outstanding, 0)
  const nplRatio = totalOutstanding > 0 ? (nplOut / totalOutstanding) * 100 : 0
  const performingCount = disbursedLoans.filter((r) => r.kol === 1).length
  const watchCount = disbursedLoans.filter((r) => r.kol === 2).length
  const nplCount = disbursedLoans.filter((r) => r.kol >= 3).length
  const healthy = nplRatio <= NPL_THRESHOLD

  const watchlistRows: WatchlistRow[] = disbursedLoans.map((row) => ({
    id: row.app.id,
    nasabahName: row.app.nasabahName,
    akadType: row.app.akadType,
    plafond: row.plafond,
    outstanding: row.outstanding,
    kol: row.kol,
    dueMs: row.dueDate.getTime(),
    dueLabel: row.dueDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
  }))

  const pct = (part: number) => (totalOutstanding > 0 ? (part / totalOutstanding) * 100 : 0)
  const composition = [
    { label: 'Lancar', tone: 'bg-success', value: pct(performingOut) },
    { label: 'DPK', tone: 'bg-warning', value: pct(watchOut) },
    { label: 'Macet', tone: 'bg-danger', value: pct(nplOut) },
  ]

  const healthHero = (
      <Card>
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
          {/* NPL headline + threshold bar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">NPL Ratio</p>
              <StatusChip tone={healthy ? 'success' : 'danger'} label={healthy ? 'Sehat' : 'Perlu perhatian'} />
            </div>
            <p className={cn('font-heading text-4xl font-semibold leading-none tracking-tight tabular', healthy ? 'text-foreground' : 'text-danger')}>
              {nplRatio.toFixed(1)}%
            </p>
            <div className="space-y-1.5 pt-1">
              <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', healthy ? 'bg-success' : 'bg-danger')}
                  style={{ width: `${Math.min(nplRatio / 10, 1) * 100}%` }}
                />
                {/* 5% threshold marker on a 0–10% scale */}
                <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: '50%' }} aria-hidden />
              </div>
              <p className="text-xs text-muted-foreground">
                Ambang sehat &lt; {NPL_THRESHOLD}% · {formatRupiah(nplOut)} dari {formatRupiah(totalOutstanding)} bermasalah
              </p>
            </div>
          </div>

          {/* Kol composition of the disbursed book (by outstanding) */}
          <div className="space-y-3 lg:border-l lg:pl-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Komposisi Buku (outstanding)</p>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {composition.map((seg) => seg.value > 0 && (
                <div key={seg.label} className={seg.tone} style={{ width: `${seg.value}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {composition.map((seg) => (
                <span key={seg.label} className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className={cn('size-2 rounded-full', seg.tone)} />
                  {seg.label}
                  <span className="font-medium text-foreground tabular-nums">{seg.value.toFixed(0)}%</span>
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
  )

  return (
    <Page.Root>
      <Page.Header title="Portofolio Monitoring" description="Pemantauan kolektibilitas fasilitas yang telah dicairkan — peringatan dini sebelum menjadi NPL." />

      {healthHero}

      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Wallet} label="Total Outstanding" value={formatRupiah(totalOutstanding)} sub={`${disbursedLoans.length} fasilitas dicairkan`} tone="primary" />
        <StatCard icon={CheckCircle2} label="Performing" value={String(performingCount)} sub="Kolektibilitas lancar (Kol 1)" tone="success" />
        <StatCard icon={Eye} label="Watch List" value={String(watchCount)} sub="Dalam perhatian khusus (Kol 2)" tone="warning" />
        <StatCard icon={ShieldAlert} label="Macet / NPL" value={String(nplCount)} sub="Kol ≥3 — non-performing" tone="danger" emphasizeValue={nplCount > 0} />
      </div>

      <WatchlistTable rows={watchlistRows} />
    </Page.Root>
  )
}
