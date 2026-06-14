'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getReviewDueStateAction } from '@/server/actions/lineage-read'
import type { ReviewDueState } from '@/lib/review-cadence'
import type { LoanApplication } from '@/lib/types'

// P5 review-due indicator (RM-led redesign §7 / Topic 7). A small shape-coded chip surfaced on a
// disbursed facility whose scheduled review is DUE or approaching (SOON). Triangle = warning
// (shape-coded, never colour-alone — WCAG 1.4.1). 'ok'/'n-a' renders nothing.
//
// The cadence anchors on the disbursement DATE only (INVARIANT "Mizan records, never monitors") — it
// fetches the PURE reviewDueState via a thin read action rather than threading the Customer cadence
// through the cockpit. Only mounts the fetch for a disbursed facility (others are always 'n/a').

function dueLabel(state: ReviewDueState): string {
  const date = state.dueDate
    ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(state.dueDate)
    : ''
  return state.status === 'due' ? `Review jatuh tempo${date ? ` · ${date}` : ''}` : `Review mendekati${date ? ` · ${date}` : ''}`
}

export function ReviewDueChip({ app }: { app: LoanApplication }) {
  const [state, setState] = useState<ReviewDueState | null>(null)

  useEffect(() => {
    // Only a disbursed facility can have a due review — skip the round-trip otherwise.
    if (!app.disbursedAt) return
    let active = true
    getReviewDueStateAction(app.id)
      .then((s) => active && setState(s))
      .catch((e) => console.error('review-due fetch failed', e))
    return () => {
      active = false
    }
  }, [app.id, app.disbursedAt])

  if (!state || (state.status !== 'due' && state.status !== 'soon')) return null
  const isDue = state.status === 'due'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        isDue ? 'bg-warning-subtle text-warning-foreground ring-warning/20' : 'bg-amber-50 text-amber-700 ring-amber-600/15',
      )}
      title={dueLabel(state)}
    >
      <AlertTriangle className="size-3" aria-hidden="true" />
      {dueLabel(state)}
    </span>
  )
}
