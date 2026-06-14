'use client'

import Link from 'next/link'
import { Info, ChevronRight } from 'lucide-react'

/**
 * Create-time SOFT dedup nudge (ADR-0020 §2 customer-first). An inline, non-blocking advisory
 * banner — NOT a modal, NEVER a hard block: it surfaces existing Customer files that share the
 * identity key the RM just typed (NIK / NPWP / NIB) and links to each file, but never gates submit.
 *
 * Severity = INFO, shape-coded with the circle `Info` icon + text (WCAG 1.4.1 — never colour alone),
 * mirroring the `border-info/20 bg-info-subtle/50 text-info-foreground` info-banner idiom used in
 * MUAPTab. `role="status"` so assistive tech announces it politely when matches appear/clear.
 *
 * Renders nothing when there are no matches.
 */
export function CustomerDedupNudge({
  matches,
}: {
  matches: { id: string; label: string; applicationCount: number }[]
}) {
  if (matches.length === 0) return null

  return (
    <div
      role="status"
      className="col-span-full flex flex-col gap-2 rounded-md border border-info/20 bg-info-subtle/50 px-3 py-2.5 text-sm text-info-foreground"
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Nasabah ini sudah terdaftar — <strong>buka filenya?</strong>
        </span>
      </div>
      <ul className="flex flex-col gap-1 pl-6">
        {matches.map((match) => (
          <li key={match.id}>
            <Link
              href={`/nasabah/${match.id}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-info/10"
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{match.label}</span>
                <span className="text-xs text-info-foreground/80 tabular-nums">
                  {match.applicationCount} pengajuan
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
