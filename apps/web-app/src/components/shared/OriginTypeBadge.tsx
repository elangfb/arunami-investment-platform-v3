import { FileText, RefreshCw, FilePen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LoanApplication } from '@/lib/types'

// P5 origin tag (RM-led redesign §7 / Topic 7). Distinguishes a facility cycle's provenance in the
// lineage card: original (fresh intake) · review (Bank-initiated periodic health-check) · adendum
// (Nasabah-initiated term change). Shape-coded (each origin a distinct icon, not colour alone —
// WCAG 1.4.1) and labelled in Bahasa. Absent/null originType is treated as 'original'.

type Origin = NonNullable<LoanApplication['originType']>

const ORIGIN_META: Record<Origin, { label: string; icon: typeof FileText; cls: string }> = {
  original: { label: 'Asli', icon: FileText, cls: 'bg-slate-50 text-slate-700 ring-slate-600/15' },
  review: { label: 'Review', icon: RefreshCw, cls: 'bg-blue-50 text-blue-700 ring-blue-600/15' },
  adendum: { label: 'Adendum', icon: FilePen, cls: 'bg-amber-50 text-amber-700 ring-amber-600/15' },
}

export function OriginTypeBadge({ originType, className }: { originType?: LoanApplication['originType']; className?: string }) {
  const meta = ORIGIN_META[originType ?? 'original']
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        meta.cls,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  )
}
