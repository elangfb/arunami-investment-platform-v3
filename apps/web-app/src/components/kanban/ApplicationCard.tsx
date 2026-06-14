import Link from 'next/link'
import type { LoanApplication } from '@/lib/types'
import { STAGE_NAMES } from '@/lib/types'
import { activeOwnersLabel } from '@/lib/stage-owners'
import { formatRupiah, formatTanggal } from '@/lib/sla-utils'
import { SLAChip } from '@/components/shared/SLAChip'
import { HardGateFlags } from '@/components/shared/HardGateFlags'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { totalScore, generateAspectScores, recommendationFromTotal } from '@/lib/scoring'
import { cn } from '@/lib/utils'

const REC_CHIP: Record<string, string> = {
  approve: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  conditional: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  reject: 'bg-red-50 text-red-700 ring-red-600/20',
}

interface ApplicationCardProps {
  app: LoanApplication
  showOwner?: boolean
  showDate?: boolean
  draggable?: boolean
}

export function ApplicationCard({ app, showOwner = false, showDate = false, draggable = false }: ApplicationCardProps) {
  const total = app.analysis.generated
    ? totalScore(app.analysis.scores ?? generateAspectScores(app))
    : null
  const rec = total != null ? recommendationFromTotal(total) : null
  return (
    <Link href={`/applications/${app.id}`} className="block">
      <Card
        size="sm"
        className={cn(
          'gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-accent/40 hover:shadow-[var(--shadow-card-hover)]',
          draggable && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{app.id}</span>
            <SLAChip stage={app.stage} enteredStageAt={app.enteredStageAt} app={app} />
          </div>

          <div className="font-semibold leading-snug">{app.nasabahName}</div>

          <div className="flex items-center justify-between gap-2">
            <AkadBadge akad={app.akadType} />
            <span className="text-sm font-semibold tabular-nums">{formatRupiah(app.requestedPlafond)}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-xs">
              {STAGE_NAMES[app.stage]}
            </Badge>
            {total != null && rec && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
                  REC_CHIP[rec]
                )}
              >
                Skor {total}
              </span>
            )}
          </div>

          {showOwner && (
            <div className="text-xs text-muted-foreground">
              Penanggung jawab: {activeOwnersLabel(app)}
            </div>
          )}

          {showDate && (
            <div className="text-xs text-muted-foreground">
              Diajukan: {formatTanggal(app.createdAt)}
            </div>
          )}

          {app.hardGateViolations.length > 0 && (
            <div className="truncate">
              <HardGateFlags hardGates={app.hardGates} violations={app.hardGateViolations} policy={app.riskPolicy} />
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
