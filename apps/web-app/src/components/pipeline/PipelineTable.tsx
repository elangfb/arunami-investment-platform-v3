'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { STAGE_NAMES, PHASE_NAMES, phaseOf, type AkadType, type LoanApplication, type SLAStatus, type Stage } from '@/lib/types'
import { formatRupiah, formatTanggal } from '@/lib/sla-utils'
import { SLA_RANK, applicationSLAStatus, comparePipelineRows } from '@/lib/pipeline-sort'
import { totalScore, generateAspectScores, recommendationFromTotal } from '@/lib/scoring'
import { activeOwnersLabel } from '@/lib/stage-owners'
import { Page } from '@/components/layout/Page'
import { SLAChip } from '@/components/shared/SLAChip'
import { StatusChip, type StatusTone } from '@/components/shared/StatusChip'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { HardGateFlags } from '@/components/shared/HardGateFlags'
import { ApplicationCard } from '@/components/kanban/ApplicationCard'
import { useActor } from '@/context/ActorProvider'
import { canActOnDesk } from '@/lib/auth/can'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const STAGES: Stage[] = [1, 2, 3, 4, 5, 6]
const AKAD_OPTIONS: AkadType[] = ['Murabahah', 'Musyarakah', 'Ijarah', 'Mudharabah']
const SLA_OPTIONS: Array<{ value: SLAStatus; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'at_risk', label: 'Berisiko' },
  { value: 'overdue', label: 'Terlambat' },
]

const SLA_DOT_CLASS: Record<SLAStatus, string> = {
  done: 'bg-neutral-token',
  normal: 'bg-success',
  at_risk: 'bg-warning',
  overdue: 'bg-danger',
}

const SLA_LABEL: Record<SLAStatus, string> = {
  done: 'Selesai',
  normal: 'Normal',
  at_risk: 'Berisiko',
  overdue: 'Terlambat',
}

// Recommendation → semantic tone (shared StatusChip vocabulary).
const REC_TONE: Record<string, StatusTone> = {
  approve: 'success',
  conditional: 'warning',
  reject: 'danger',
}

function getWorstSLAStatus(apps: LoanApplication[]): SLAStatus {
  return apps.reduce<SLAStatus>((worst, app) => {
    const current = applicationSLAStatus(app)
    return SLA_RANK[current] > SLA_RANK[worst] ? current : worst
  }, 'normal')
}

function scoreFor(app: LoanApplication): { total: number; rec: string } | null {
  if (!app.analysis.generated) return null
  const total = totalScore(app.analysis.scores ?? generateAspectScores(app))
  return { total, rec: recommendationFromTotal(total) }
}

const COLSPAN = 8

export function PipelineTable({ applications }: { applications: LoanApplication[] }) {
  const actor = useActor()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAkad, setFilterAkad] = useState('all')
  const [filterSLA, setFilterSLA] = useState('all')
  const [mine, setMine] = useState(false)

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return applications.filter((app) => {
      // Closed applications are terminal — they leave the active ("aktif") pipeline board.
      // The full record stays reachable on the detail page (audit-first).
      if (app.applicationStatus === 'closed') return false
      const matchesSearch =
        query.length === 0 ||
        app.id.toLowerCase().includes(query) ||
        app.nasabahName.toLowerCase().includes(query)
      const matchesAkad = filterAkad === 'all' || app.akadType === filterAkad
      const matchesSLA = filterSLA === 'all' || applicationSLAStatus(app) === filterSLA

      return matchesSearch && matchesAkad && matchesSLA && (!mine || canActOnDesk(actor, app))
    })
  }, [applications, searchQuery, filterAkad, filterSLA, mine, actor])

  // Group by stage; within each stage order rows by comparePipelineRows: most urgent first
  // (worst SLA), ties broken by the oldest submission (FIFO). Both keys are visible in the row
  // (SLA chip + the "Diajukan" column), so the order is self-explanatory.
  const applicationsByStage = useMemo(() => {
    return STAGES.reduce<Record<Stage, LoanApplication[]>>((groups, stage) => {
      groups[stage] = filteredApplications
        .filter((app) => app.stage === stage)
        .sort(comparePipelineRows)
      return groups
    }, {} as Record<Stage, LoanApplication[]>)
  }, [filteredApplications])

  return (
    <section className="space-y-4" aria-label={`Pipeline pembiayaan - ${actor.name}`}>
      <Page.Header
        title="Pipeline Pembiayaan"
        description={`${filteredApplications.length} aplikasi aktif · read-only, dikelompokkan per tahap. Perpindahan tahap dilakukan dari halaman detail.`}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cari nasabah atau ID..."
            className="w-full sm:w-[240px]"
          />
          <Select value={filterAkad} onValueChange={(value) => setFilterAkad(value ?? 'all')}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue>{filterAkad === 'all' ? 'Semua Akad' : filterAkad}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {AKAD_OPTIONS.map((akad) => (
                <SelectItem key={akad} value={akad}>{akad}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSLA} onValueChange={(value) => setFilterSLA(value ?? 'all')}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue>{filterSLA === 'all' ? 'Semua SLA' : SLA_LABEL[filterSLA as SLAStatus]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {SLA_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setMine((v) => !v)}
            aria-pressed={mine}
            className={cn(
              'inline-flex h-9 shrink-0 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
              mine ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            Tugas saya
          </button>
        </div>

      {/* Stage-distribution strip — funnel-at-a-glance + jump-to-section */}
      <div className="stagger flex flex-wrap gap-2">
        {STAGES.map((stage) => {
          const apps = applicationsByStage[stage]
          const worst = getWorstSLAStatus(apps)
          return (
            <a
              key={stage}
              href={`#stage-${stage}`}
              title={apps.length ? `SLA terburuk: ${SLA_LABEL[worst]}` : 'Tidak ada SLA'}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-muted"
            >
              <span className={cn('size-2 rounded-full', apps.length > 0 ? SLA_DOT_CLASS[worst] : 'bg-muted-foreground/30')} />
              <span className="text-foreground">{stage}. {STAGE_NAMES[stage]}</span>
              <span className="tabular text-muted-foreground">{apps.length}</span>
            </a>
          )
        })}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-4 font-medium">ID</th>
                  <th className="py-2.5 pr-4 font-medium">Nasabah</th>
                  <th className="py-2.5 pr-4 font-medium">Akad</th>
                  <th className="hidden py-2.5 pr-4 text-right font-medium md:table-cell">Plafond</th>
                  <th className="hidden whitespace-nowrap py-2.5 pr-4 font-medium md:table-cell">Diajukan</th>
                  <th className="py-2.5 pr-4 font-medium">SLA</th>
                  <th className="hidden py-2.5 pr-4 font-medium md:table-cell">Penanggung Jawab</th>
                  <th className="py-2.5 pr-5 font-medium">Skor</th>
                </tr>
              </thead>
              {STAGES.map((stage) => {
                const apps = applicationsByStage[stage]
                const worst = getWorstSLAStatus(apps)
                return (
                  <tbody key={stage}>
                    <tr id={`stage-${stage}`} className="scroll-mt-4 border-y border-border bg-muted/40">
                      <td colSpan={COLSPAN} className="px-5 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary tabular">{stage}</span>
                            <h3 className="font-semibold text-foreground">{STAGE_NAMES[stage]}</h3>
                            <span className="rounded-full bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary">Fase {phaseOf(stage)} · {PHASE_NAMES[phaseOf(stage)]}</span>
                            <Badge variant="secondary">{apps.length}</Badge>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={cn('size-2 rounded-full', apps.length > 0 ? SLA_DOT_CLASS[worst] : 'bg-muted-foreground/30')} />
                            {apps.length === 0 ? 'Tidak ada SLA' : `Worst SLA: ${SLA_LABEL[worst]}`}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {apps.length === 0 ? (
                      <tr>
                        <td colSpan={COLSPAN} className="px-5 py-4 text-center text-sm text-muted-foreground">
                          Tidak ada aplikasi di tahap ini
                        </td>
                      </tr>
                    ) : (
                      apps.map((app) => {
                        const score = scoreFor(app)
                        return (
                          <tr key={app.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
                            <td className="py-3 pl-5 pr-4">
                              <Link href={`/applications/${app.id}`} className="whitespace-nowrap font-mono text-xs font-medium text-primary hover:underline">
                                {app.id}
                              </Link>
                            </td>
                            <td className="py-3 pr-4 font-medium">{app.nasabahName}</td>
                            <td className="py-3 pr-4"><AkadBadge akad={app.akadType} /></td>
                            <td className="hidden whitespace-nowrap py-3 pr-4 text-right tabular md:table-cell">{formatRupiah(app.requestedPlafond)}</td>
                            <td className="hidden whitespace-nowrap py-3 pr-4 text-muted-foreground md:table-cell">{formatTanggal(app.createdAt)}</td>
                            <td className="py-3 pr-4"><SLAChip stage={app.stage} enteredStageAt={app.enteredStageAt} app={app} /></td>
                            <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{activeOwnersLabel(app)}</td>
                            <td className="py-3 pr-5">
                              <div className="flex flex-col items-start gap-1">
                                {score && (
                                  <StatusChip tone={REC_TONE[score.rec] ?? 'neutral'} label={`Skor ${score.total}`} dot={false} />
                                )}
                                {app.hardGateViolations.length > 0 && (
                                  <HardGateFlags hardGates={app.hardGates} violations={app.hardGateViolations} policy={app.riskPolicy} />
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                )
              })}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile: stacked cards per stage (the dense table is md+ only) */}
      <div className="space-y-5 md:hidden">
        {STAGES.map((stage) => {
          const apps = applicationsByStage[stage]
          const worst = getWorstSLAStatus(apps)
          return (
            <div key={stage} id={`stage-${stage}-m`} className="scroll-mt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary tabular">{stage}</span>
                  <h3 className="text-sm font-semibold text-foreground">{STAGE_NAMES[stage]}</h3>
                  <Badge variant="secondary">{apps.length}</Badge>
                </div>
                {apps.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('size-2 rounded-full', SLA_DOT_CLASS[worst])} />
                    {SLA_LABEL[worst]}
                  </span>
                )}
              </div>
              {apps.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">Tidak ada aplikasi di tahap ini</p>
              ) : (
                <div className="space-y-2">
                  {apps.map((app) => <ApplicationCard key={app.id} app={app} showOwner showDate />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
