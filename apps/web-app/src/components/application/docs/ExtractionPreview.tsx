'use client'

import { Badge } from '@/components/ui/badge'
import type { ExtractedSnapshot, MatrixAspect, RatioKey, RiskLevel } from '@/lib/extraction/types'
import { scoresFromSnapshot, hasMatrixSignal } from '@/lib/scoring-from-extracted'
import { totalScore, recommendationFromTotal, RECOMMENDATION_LABEL } from '@/lib/scoring'
import { cn } from '@/lib/utils'

const ASPECT_LABEL: Record<MatrixAspect, string> = {
  character: 'Character',
  capacity: 'Capacity',
  capital: 'Capital',
  collateral: 'Collateral',
  condition: 'Condition',
  sharia_compliance: 'Sharia Compliance',
  sharia_structuring: 'Sharia Structuring',
}

const RATIO_LABEL: Record<RatioKey, string> = {
  dscri: 'DSCRi',
  der: 'DER',
  currentRatio: 'Current Ratio',
  gpm: 'GPM',
  npm: 'NPM',
}

const LEVEL_LABEL: Record<RiskLevel, string> = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' }
const LEVEL_CLASS: Record<RiskLevel, string> = {
  low: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
}

function LevelBadge({ level }: { level: RiskLevel | null }) {
  if (!level) return <span className="text-muted-foreground">—</span>
  return <Badge className={cn('font-medium', LEVEL_CLASS[level])}>{LEVEL_LABEL[level]}</Badge>
}

export function ExtractionPreview({ snapshot, view }: { snapshot: ExtractedSnapshot; view: 'muap' | 'rsk' }) {
  return view === 'rsk' ? <RskPreview snapshot={snapshot} /> : <MuapPreview snapshot={snapshot} />
}

function RskPreview({ snapshot }: { snapshot: ExtractedSnapshot }) {
  const scored = hasMatrixSignal(snapshot)
  const total = scored ? totalScore(scoresFromSnapshot(snapshot)) : null
  return (
    <div className="space-y-4">
      {total != null && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
          <Badge className="bg-primary text-white">Skor 5C+2S (dari Docs) <span className="ml-1 tabular-nums">{total}/100</span></Badge>
          <Badge variant="outline">{RECOMMENDATION_LABEL[recommendationFromTotal(total)]}</Badge>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              {['Dimensi', 'Level', 'Temuan', 'Mitigasi'].map((h) => (
                <th key={h} className="border px-2 py-1.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.matrix.map((row) => (
              <tr key={row.aspect} className="align-top">
                <td className="border px-2 py-1.5 font-medium">{ASPECT_LABEL[row.aspect]}</td>
                <td className="border px-2 py-1.5"><LevelBadge level={row.level} /></td>
                <td className="border px-2 py-1.5 text-slate-700">{row.finding || '—'}</td>
                <td className="border px-2 py-1.5 text-slate-700">{row.mitigation || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {snapshot.racDeviations.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deviasi RAC</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {snapshot.racDeviations.map((d, i) => (
              <li key={i}><span className="font-medium">{d.item}</span>{d.justification ? ` — ${d.justification}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function MuapPreview({ snapshot }: { snapshot: ExtractedSnapshot }) {
  const periods = snapshot.ratios.find((r) => r.points.length)?.points.map((p) => p.period) ?? []
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="border px-2 py-1.5 text-left font-semibold">Rasio</th>
              {periods.map((p, i) => (
                <th key={i} className="border px-2 py-1.5 text-right font-semibold tabular-nums">{p || `Periode ${i + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.ratios.map((r) => (
              <tr key={r.key}>
                <td className="border px-2 py-1.5 font-medium">{RATIO_LABEL[r.key]}</td>
                {(r.points.length ? r.points : periods.map(() => null)).map((pt, i) => (
                  <td key={i} className="border px-2 py-1.5 text-right tabular-nums">{pt && pt.value != null ? pt.value : '·'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="Nilai Pasar Agunan" value={snapshot.collateral.marketValue} />
        <Metric label="Nilai Likuidasi (CEV)" value={snapshot.collateral.liquidationValue} />
        <Metric label="SCCR" value={snapshot.collateral.sccrPercent} suffix="%" />
      </div>
    </div>
  )
}

function Metric({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value != null ? `${value.toLocaleString('id-ID')}${suffix ?? ''}` : '—'}</p>
    </div>
  )
}
