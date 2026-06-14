'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Megaphone, ChevronRight, Check, Undo2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/shared/StatusChip'
import { runAction } from '@/lib/client-action'
import { completeColekAction, rejectColekAction } from '@/server/actions/colek-actions'

// One incoming COLEK (cross-desk work request) directed AT the current user — the serializable view
// fed to the Home panel. Mirrors the AwaitingSignaturePanel item shape (server-resolved, no client fetch).
export interface IncomingColekView {
  colekId: string
  appId: string
  nasabahName: string
  targetDesk: string
  requestedByName: string
  description: string
}

// Home directive strip: cross-desk COLEK requests directed AT this user (work others asked OF them).
// Mirrors AwaitingSignaturePanel — the assignee is often NOT a stage owner of the app, so these would
// otherwise be invisible on the Kanban below; this is their "Tugas Saya" for nudged work. Each row:
// requester → nasabah → what's asked, with "Tandai selesai" (complete) + "Tolak" (reject, reason
// mandatory). Read-leaning; shape-coded (megaphone = info/permintaan, never colour-only). Derived from
// the SAME listColekNotices as the sidebar badge + /notifications, so the three never disagree.
export function IncomingColekPanel({ items }: { items: IncomingColekView[] }) {
  if (items.length === 0) return null
  return (
    <section className="space-y-2.5 rounded-2xl border border-info/30 bg-info-subtle/30 p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex size-6 items-center justify-center rounded-lg bg-info-subtle text-info-foreground"
          role="img"
          aria-label="Permintaan kerja masuk"
        >
          <Megaphone className="size-3.5" />
        </span>
        <h2 className="font-heading font-semibold text-foreground">Permintaan kerja untuk Anda</h2>
        <span className="ml-auto rounded-full bg-info-subtle px-2 py-0.5 text-xs font-semibold tabular-nums text-info-foreground">
          {items.length}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <ColekRowCard key={item.colekId} item={item} />
        ))}
      </div>
    </section>
  )
}

function ColekRowCard({ item }: { item: IncomingColekView }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const complete = () =>
    startTransition(() =>
      runAction(
        () => completeColekAction(item.colekId),
        () => {
          toast.success('Colek ditandai selesai')
          router.refresh()
        },
      ),
    )

  const reject = () =>
    startTransition(() =>
      runAction(
        () => rejectColekAction(item.colekId, reason.trim()),
        () => {
          toast.success('Colek ditolak')
          setRejecting(false)
          setReason('')
          router.refresh()
        },
      ),
    )

  return (
    <Card className="border-l-[3px] border-l-info p-0">
      <div className="flex items-start gap-3 p-3.5">
        {/* Shape-coded severity (WCAG 1.4.1) — megaphone = info/permintaan, never colour-only. */}
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-info-subtle text-info-foreground"
          role="img"
          aria-label="Permintaan kerja"
        >
          <Megaphone className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{item.nasabahName}</span>
            <StatusChip tone="neutral" label={item.appId} dot={false} />
            <span className="text-xs text-muted-foreground">diminta oleh {item.requestedByName}</span>
          </div>
          <p className="text-sm text-muted-foreground">{item.description}</p>

          {!rejecting ? (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button type="button" size="sm" disabled={pending} onClick={complete} className="gap-1.5">
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                Tandai selesai
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)} className="gap-1.5">
                <Undo2 className="size-3.5" aria-hidden />
                Tolak
              </Button>
              <Link
                href={`/applications/${item.appId}?view=ringkasan`}
                className="ml-auto hidden shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline sm:inline-flex"
              >
                Buka <ChevronRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2 pt-0.5">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Alasan penolakan (wajib)…"
                className="w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="destructive" disabled={pending || !reason.trim()} onClick={reject} className="gap-1.5">
                  <Undo2 className="size-3.5" aria-hidden />
                  Kirim penolakan
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setRejecting(false); setReason('') }}>
                  Batal
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
