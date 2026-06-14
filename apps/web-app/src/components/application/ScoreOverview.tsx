'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ASPECT_LABEL,
  ASPECT_ORDER,
  aspectStatus,
  recommendationFromTotal,
  RECOMMENDATION_LABEL,
  totalScore,
  type AspectScores,
} from '@/lib/scoring'
import { cn } from '@/lib/utils'

const STATUS_BAR: Record<string, string> = {
  pass: 'bg-emerald-500',
  warn: 'bg-amber-500',
  weak: 'bg-red-500',
}
const STATUS_TEXT: Record<string, string> = {
  pass: 'text-emerald-600',
  warn: 'text-amber-600',
  weak: 'text-red-600',
}
const REC_COLOR = { approve: '#16a34a', conditional: '#ca8a04', reject: '#dc2626' }
const REC_BADGE = {
  approve: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  conditional: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  reject: 'bg-red-50 text-red-700 ring-red-600/20',
}

export function ScoreOverview({ scores }: { scores: AspectScores }) {
  const total = totalScore(scores)
  const rec = recommendationFromTotal(total)
  const color = REC_COLOR[rec]
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - total / 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Skor Kelayakan 5C+1S</CardTitle>
        <CardDescription>
          Skor 5C+1S dihitung deterministik dari data aplikasi; narasi dibantu AI — keputusan tetap pada analis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          {/* Total — the mizan balance */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div className="relative h-32 w-32">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={r} fill="none" stroke="#e6edf5" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke={color}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold tabular-nums" style={{ color }}>
                  {total}
                </span>
                <span className="text-[11px] text-muted-foreground">/ 100</span>
              </div>
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
                REC_BADGE[rec]
              )}
            >
              {RECOMMENDATION_LABEL[rec]}
            </span>
          </div>

          {/* Per-aspect breakdown */}
          <div className="w-full flex-1 space-y-2.5">
            {ASPECT_ORDER.map((k) => {
              const s = scores[k]
              if (s == null) return null
              const st = aspectStatus(s)
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
                    {ASPECT_LABEL[k]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-700 ease-out', STATUS_BAR[st])}
                      style={{ width: `${s}%` }}
                    />
                  </div>
                  <span className={cn('w-6 shrink-0 text-right text-xs font-semibold tabular-nums', STATUS_TEXT[st])}>
                    {s}
                  </span>
                </div>
              )
            })}
            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
              Ambang: ≥80 Direkomendasikan · 60–79 Bersyarat · &lt;60 Tidak Direkomendasikan.
              Bobot per aspek mengikuti kebijakan skoring bank.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
