import { cn } from '@/lib/utils'
import type { AkadType } from '@/lib/types'

// Akad-typed colour coding (matches FOS akad palette). A contextual syariah
// touch: each contract family reads at a glance.
//   Murabahah → blue · Musyarakah → violet · Ijarah → cyan · Mudharabah → amber
const AKAD_STYLES: Record<AkadType, string> = {
  Murabahah: 'bg-blue-50 text-blue-700 ring-blue-600/15',
  Musyarakah: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  Ijarah: 'bg-cyan-50 text-cyan-700 ring-cyan-600/15',
  Mudharabah: 'bg-amber-50 text-amber-700 ring-amber-600/15',
}

export function AkadBadge({ akad, className }: { akad: AkadType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        AKAD_STYLES[akad],
        className
      )}
    >
      {akad}
    </span>
  )
}
