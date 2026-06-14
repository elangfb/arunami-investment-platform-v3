'use client'

import { Page } from '@/components/layout/Page'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SLAChip } from '@/components/shared/SLAChip'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { DEFAULT_RISK_POLICY } from '@/lib/hardGates'
import { getSLAStatus, getSLALabel, formatRupiah } from '@/lib/sla-utils'
import { STAGE_NAMES, type AkadType, type LoanApplication, type SLAStatus, type Stage } from '@/lib/types'

const stages: Stage[] = [1, 2, 3, 4, 5, 6]
const akadTypes: AkadType[] = ['Murabahah', 'Musyarakah', 'Ijarah', 'Mudharabah']

const stageColors: Record<Stage, string> = {
  1: 'bg-blue-500',
  2: 'bg-violet-500',
  3: 'bg-emerald-500',
  4: 'bg-red-500',
  5: 'bg-purple-500',
  6: 'bg-teal-500',
}

const slaLabels: Record<SLAStatus, string> = {
  done: 'Selesai',
  normal: 'Normal',
  at_risk: 'Berisiko',
  overdue: 'Terlambat',
}

function formatMiliar(amount: number) {
  return `Rp ${(amount / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} miliar`
}

function getDaysInStage(enteredStageAt: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(0, Math.floor((Date.now() - enteredStageAt.getTime()) / msPerDay))
}

function formatShortTime(timestamp: Date) {
  return timestamp.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function ManagementDashboard({ applications = [] }: { applications?: LoanApplication[] }) {
  const actor = useActor()

  const activeApps = applications.filter((app) => app.stage >= 1 && app.stage <= 6)
  const totalActive = activeApps.length
  const byStage = stages.map((stage) => ({
    stage,
    name: STAGE_NAMES[stage],
    shortName: STAGE_NAMES[stage].split(' ')[0],
    count: activeApps.filter((app) => app.stage === stage).length,
  }))
  const maxStageCount = Math.max(...byStage.map((item) => item.count), 1)
  const slaBreaches = activeApps.filter((app) => getSLAStatus(app.stage, app.enteredStageAt, app.slaTargetDays) === 'overdue').length
  const totalPlafond = activeApps.reduce((sum, app) => sum + app.requestedPlafond, 0)
  const flaggedApps = activeApps.filter((app) => app.hardGateViolations.length > 0)
  const nplFlags = activeApps.filter((app) => app.hardGateViolations.includes('kol') || app.hardGates.kol > (app.riskPolicy ?? DEFAULT_RISK_POLICY).kolMax)
  const recentApps = [...activeApps]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)

  const byAkad = akadTypes.map((akad) => ({
    akad,
    count: activeApps.filter((app) => app.akadType === akad).length,
  }))
  const maxAkadCount = Math.max(...byAkad.map((item) => item.count), 1)

  const slaCounts: Record<SLAStatus, number> = { done: 0, normal: 0, at_risk: 0, overdue: 0 }
  const appsWithSla = activeApps.map((app) => {
    const status = getSLAStatus(app.stage, app.enteredStageAt, app.slaTargetDays)
    slaCounts[status] += 1
    return { ...app, slaStatus: status, daysInStage: getDaysInStage(app.enteredStageAt) }
  })
  const slaCompliant = totalActive === 0 ? 100 : Math.round((slaCounts.normal / totalActive) * 100)
  const watchedSlaApps = appsWithSla
    .filter((app) => app.slaStatus === 'at_risk' || app.slaStatus === 'overdue')
    .sort((a, b) => b.daysInStage - a.daysInStage)
    .slice(0, 8)

  const auditTrail = applications.flatMap((app) =>
    app.history.map((entry) => ({ ...entry, appId: app.id }))
  )
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 10)

  const slaByStage = stages.map((stage) => {
    const apps = activeApps.filter((app) => app.stage === stage)
    const counts: Record<SLAStatus, number> = { done: 0, normal: 0, at_risk: 0, overdue: 0 }
    apps.forEach((app) => { counts[getSLAStatus(app.stage, app.enteredStageAt, app.slaTargetDays)] += 1 })
    return { stage, name: STAGE_NAMES[stage], total: apps.length, ...counts }
  })

  if (!hasDesk(actor, 'MG')) {
    return (
      <div className="space-y-4">
        <Page.Header title="Dashboard Manajemen" description="Dashboard lengkap tersedia untuk Management." />
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Anda dapat melihat ringkasan pipeline melalui menu Pipeline sesuai peran Anda.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Page.Header title="Dashboard Manajemen" description="Ringkasan pipeline pembiayaan MIZAN." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Aplikasi Aktif" value={totalActive.toString()} subtitle="Di semua tahap" />
        <KpiCard title="Pelanggaran SLA" value={slaBreaches.toString()} badge={slaBreaches > 0 ? <Badge variant="destructive">Overdue</Badge> : undefined} />
        <KpiCard title="Total Plafond" value={formatMiliar(totalPlafond)} subtitle="Dalam pipeline" />
        <KpiCard title="Dengan Red Flag" value={flaggedApps.length.toString()} badge={<Badge className="bg-amber-100 text-amber-800">{nplFlags.length} KOL</Badge>} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Distribusi Akad</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {byAkad.map((item) => (
              <div key={item.akad} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <AkadBadge akad={item.akad} />
                  <span className="font-semibold tabular-nums text-primary">{item.count} aplikasi</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted">
                  <div
                    className="h-2.5 rounded-full bg-primary"
                    style={{ width: `${Math.max((item.count / maxAkadCount) * 100, item.count ? 8 : 0)}%` }}
                    aria-label={`${item.akad}: ${item.count} aplikasi`}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Volume per Tahap</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-64 items-end justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-6">
              {byStage.map((item) => (
                <div key={item.stage} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-sm font-semibold tabular-nums text-primary">{item.count}</span>
                  <div className="flex h-40 w-full items-end justify-center">
                    <div
                      className={`w-full max-w-16 rounded-t-md ${stageColors[item.stage]}`}
                      style={{ height: `${Math.max((item.count / maxStageCount) * 100, item.count ? 8 : 0)}%` }}
                      aria-label={`${item.name}: ${item.count} aplikasi`}
                    />
                  </div>
                  <span className="text-center text-xs text-muted-foreground">Tahap {item.stage}<br />{item.shortName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>SLA Monitor</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Kepatuhan" value={`${slaCompliant}%`} className="text-primary" />
            <Metric label="Normal" value={slaCounts.normal.toString()} className="text-emerald-600" />
            <Metric label="Berisiko" value={slaCounts.at_risk.toString()} className="text-amber-600" />
            <Metric label="Terlambat" value={slaCounts.overdue.toString()} className="text-red-600" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground"><tr><th className="py-2">ID</th><th>Debitur</th><th>Tahap</th><th>Hari di Tahap</th><th>Status</th></tr></thead>
              <tbody>
                {watchedSlaApps.length === 0 ? (
                  <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Tidak ada aplikasi at risk atau overdue.</td></tr>
                ) : watchedSlaApps.map((app) => (
                  <tr key={app.id} className="border-b last:border-0">
                    <td className="py-3 font-medium tabular-nums">{app.id}</td>
                    <td>{app.nasabahName}</td>
                    <td>{STAGE_NAMES[app.stage]}</td>
                    <td className="tabular-nums">{app.daysInStage} hari</td>
                    <td><Badge variant={app.slaStatus === 'overdue' ? 'destructive' : 'secondary'}>{slaLabels[app.slaStatus]} · {getSLALabel(app.stage, app.enteredStageAt, app.slaTargetDays)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status SLA per Tahap</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground"><tr><th className="py-2">Tahap</th><th>Total</th><th>Normal</th><th>Berisiko</th><th>Terlambat</th></tr></thead>
              <tbody>
                {slaByStage.map((row) => (
                  <tr key={row.stage} className="border-b last:border-0"><td className="py-3 font-medium">{row.name}</td><td className="tabular-nums">{row.total}</td><td className="tabular-nums">{row.normal}</td><td className="font-semibold tabular-nums text-amber-600">{row.at_risk}</td><td className="font-semibold tabular-nums text-red-600">{row.overdue}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audit Trail Terbaru</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {auditTrail.map((entry) => (
              <div key={`${entry.appId}-${entry.id}`} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-semibold">{entry.action}</p>
                  <p className="text-muted-foreground"><span className="tabular-nums">{entry.appId}</span> · {entry.userName}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatShortTime(entry.timestamp)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Applications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {recentApps.map((app) => (
            <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div><p className="font-semibold">{app.id} · {app.nasabahName}</p><p className="text-muted-foreground">{app.akadType} · {formatRupiah(app.requestedPlafond)}</p></div>
              <div className="flex items-center gap-2"><Badge variant="outline">{STAGE_NAMES[app.stage]}</Badge><SLAChip stage={app.stage} enteredStageAt={app.enteredStageAt} app={app} /></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Flag Risiko</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {flaggedApps.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada red flag aktif.</p> : flaggedApps.map((app) => (
            <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div><p className="font-semibold">{app.id}</p><p className="text-muted-foreground">{app.nasabahName}</p></div>
              <div className="flex flex-wrap gap-2">{app.hardGateViolations.map((flag) => <Badge key={flag} className="bg-amber-100 text-amber-800">{flag.toUpperCase()}</Badge>)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({ title, value, subtitle, badge }: { title: string; value: string; subtitle?: string; badge?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle>{badge}</CardHeader>
      <CardContent><div className="text-2xl font-bold tabular-nums">{value}</div>{subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}</CardContent>
    </Card>
  )
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${className ?? ''}`}>{value}</p>
    </div>
  )
}
