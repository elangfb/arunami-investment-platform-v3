import Link from 'next/link'
import { PenLine, TriangleAlert, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { StatusChip } from '@/components/shared/StatusChip'
import type { NotificationItem } from '@/lib/notifications'

// Home directive strip: MUAP/RSK ladder rungs awaiting THIS actor's signature. The checker
// signers (TL, RTL) are NOT stage owners, so these apps never surface in the
// stage-assignment Kanban below — this is their "Tugas Saya" for signatures
// (approval-routing-config.md gap #2). Derived (no store) from the SAME
// listAwaitingApprovalNotices as the sidebar badge + /notifications, so the three never
// disagree. Directive, not workspace: nasabah → why → one tap into the doc to sign.
export function AwaitingSignaturePanel({ items }: { items: NotificationItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="space-y-2.5 rounded-2xl border border-warning/30 bg-warning-subtle/30 p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 items-center justify-center rounded-lg bg-warning-subtle text-warning-foreground"
          role="img"
          aria-label="Menunggu tanda tangan"
        >
          <PenLine className="size-3.5" />
        </span>
        <h2 className="font-heading font-semibold text-foreground">Menunggu tanda tangan Anda</h2>
        <span className="ml-auto rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-foreground">
          {items.length}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <Link key={item.id} href={item.href} className="block">
            <Card className="border-l-[3px] border-l-warning p-0 transition-colors hover:bg-accent/30">
              <div className="flex items-start gap-3 p-3.5">
                {/* Shape-coded severity (WCAG 1.4.1) — triangle = warning/perlu tindakan, never colour-only. */}
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning-subtle text-warning-foreground"
                  role="img"
                  aria-label="Perlu tindakan"
                >
                  <TriangleAlert className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{item.nasabahName}</span>
                    <StatusChip tone="neutral" label={item.appId} dot={false} />
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                {/* The whole card is the link; this is an affordance, hidden on the tightest breakpoint. */}
                <span className="mt-0.5 hidden shrink-0 items-center gap-1 text-xs font-medium text-primary sm:inline-flex">
                  {item.cta}
                  <ChevronRight className="size-3.5" />
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
