'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { OriginTypeBadge } from '@/components/shared/OriginTypeBadge'
import { getFacilityLineageAction } from '@/server/actions/lineage-read'
import { cn } from '@/lib/utils'
import { phaseLabel, type LoanApplication } from '@/lib/types'

// P5 lineage card (RM-led redesign §7 / Topic 7). "Riwayat fasilitas" — the review/adendum chain in
// CAUSAL order (root → … → head), so an operator sees the full story of how the facility evolved and
// which cycle holds the CURRENT terms (the head, marked "ketentuan terkini"). Each row deep-links to
// that cycle's detail. Styled after the RingkasanView RecentActivity ordered-list idiom.
//
// Only shown when the app participates in a lineage — i.e. it has a parent (sourceApplicationId set) OR
// it has descendants (the fetched chain has more than one element). A standalone original (no parent,
// no children) renders nothing. The chain is fetched on mount (getFacilityLineageAction resolves the
// HEAD then walks the full root→head chain) rather than threading it through the dossier layout.

function cycleDate(d: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(d))
}

export function FacilityLineageCard({ app }: { app: LoanApplication }) {
  const [chain, setChain] = useState<LoanApplication[] | null>(null)

  useEffect(() => {
    // Fetch when the app might be in a lineage: it has a parent, OR it could be a root with children.
    // The action returns the full root→head chain from any node; a length ≤ 1 means no lineage.
    let active = true
    getFacilityLineageAction(app.id)
      .then((c) => active && setChain(c))
      .catch((e) => console.error('lineage fetch failed', e))
    return () => {
      active = false
    }
  }, [app.id])

  if (!chain || chain.length <= 1) return null

  const headId = chain[chain.length - 1]?.id

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Riwayat fasilitas</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {chain.map((cycle, i) => {
            const isHead = cycle.id === headId
            const isCurrent = cycle.id === app.id
            return (
              <li key={cycle.id} className="flex gap-3">
                {/* Causal-order marker: a numbered node, head highlighted. */}
                <span
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    isHead ? 'bg-primary/10 text-primary ring-1 ring-primary/20' : 'bg-muted text-muted-foreground ring-1 ring-border',
                  )}
                  aria-hidden="true"
                >
                  {isHead ? <Star className="size-3" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/applications/${cycle.id}`}
                      className={cn(
                        'font-mono text-xs hover:underline',
                        isCurrent ? 'font-semibold text-foreground' : 'text-primary',
                      )}
                    >
                      {cycle.id}
                    </Link>
                    <OriginTypeBadge originType={cycle.originType} />
                    {cycle.komiteDecision && <DecisionChip decision={cycle.komiteDecision} />}
                    {isHead && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-inset ring-primary/20">
                        ketentuan terkini
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cycleDate(cycle.createdAt)} · {phaseLabel(cycle.stage)}
                    {isCurrent && ' · pengajuan ini'}
                  </p>
                </div>
                {!isCurrent && (
                  <Link
                    href={`/applications/${cycle.id}`}
                    className="mt-0.5 inline-flex shrink-0 items-center text-muted-foreground hover:text-primary"
                    aria-label={`Buka ${cycle.id}`}
                  >
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
