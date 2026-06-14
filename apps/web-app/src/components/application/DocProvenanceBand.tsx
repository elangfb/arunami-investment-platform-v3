'use client'

import { Sparkles } from 'lucide-react'
import { StatusChip } from '@/components/shared/StatusChip'

// Shared "Disusun AI · …" band for MUAP/RSK doc tabs (workflow-finetune.md §15.4).
// Always-on header so the AI-draft vs human-verified status of the memo is legible at a glance
// + auditable. Verified = the analyst/RT pulled the latest from Google Docs (the live source
// of truth), implicitly approving what's there. `verifiedLabel` localises the verifier copy
// per surface (analyst on MUAP, Tim Risiko on RSK).
export function DocProvenanceBand({
  syncedAt,
  verifiedLabel,
  pendingLabel,
}: {
  syncedAt: Date | string | null | undefined
  verifiedLabel: string
  pendingLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-[var(--shadow-card)]">
      <Sparkles className="size-4 shrink-0 text-info" aria-hidden />
      <span className="font-medium">Disusun AI</span>
      <span className="text-muted-foreground">·</span>
      {syncedAt ? (
        <StatusChip
          tone="success"
          size="sm"
          label={`${verifiedLabel} ${new Date(syncedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`}
        />
      ) : (
        <StatusChip tone="warning" size="sm" label={pendingLabel} />
      )}
    </div>
  )
}
