'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, FilePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { runAction } from '@/lib/client-action'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { startReviewAction, startAdendumAction } from '@/server/actions/application-review'
import type { LoanApplication } from '@/lib/types'

// P5 entry CTAs (RM-led redesign §7 / Topic 7 · Fork C9 — review/adendum = a shortcut from the existing
// app). On an APPROVED or DISBURSED facility, the RM (intake desk) can start a new pipeline cycle:
//   • "Mulai Review"  — Bank-initiated periodic health-check (the bank re-underwrites on cadence).
//   • "Buat Adendum"  — Nasabah-initiated term change (the customer asks to amend the facility).
// Both reuse the FULL pipeline and differ only by initiator (originType). Each opens a small confirm
// that optionally captures an off-cadence REASON (recorded as a body-free audit entry), then calls the
// intake-gated server action and navigates to the freshly-created child app's detail.
//
// This lives in the cockpit HEADER, NOT the ActionBand: each needs a form/choice first (the confirm +
// optional reason), so it is a navigational shortcut, not a one-tap stage action (see apps/web-app
// AGENTS.md "Tugas Anda vs Alur kerja").

type Kind = 'review' | 'adendum'

const KIND_META: Record<Kind, { cta: string; icon: typeof RefreshCw; title: string; help: string; submit: string }> = {
  review: {
    cta: 'Mulai Review',
    icon: RefreshCw,
    title: 'Mulai Review fasilitas',
    help: 'Review berkala diinisiasi Bank — fasilitas di-underwrite ulang melalui pipeline penuh dari awal.',
    submit: 'Mulai Review',
  },
  adendum: {
    cta: 'Buat Adendum',
    icon: FilePen,
    title: 'Buat Adendum fasilitas',
    help: 'Adendum diinisiasi atas permintaan Nasabah untuk mengubah ketentuan — melewati pipeline penuh dari awal.',
    submit: 'Buat Adendum',
  },
}

export function ReviewAdendumActions({ app }: { app: LoanApplication }) {
  const actor = useActor()
  const router = useRouter()
  const [openKind, setOpenKind] = useState<Kind | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Gate: a live facility the RM may re-cycle. APPROVED (committee said approve) OR already DISBURSED
  // ('Cair'), AND the actor holds the intake desk (the action re-asserts this server-side).
  const isLiveFacility = app.komiteDecision === 'approve' || app.disbursementStatus === 'Cair'
  if (!isLiveFacility || !hasDesk(actor, 'intake')) return null

  function open(kind: Kind) {
    setReason('')
    setOpenKind(kind)
  }

  async function submit() {
    if (!openKind || submitting) return
    setSubmitting(true)
    const kind = openKind
    const trimmed = reason.trim() || undefined
    await runAction(
      () => (kind === 'review' ? startReviewAction(app.id, trimmed) : startAdendumAction(app.id, trimmed)),
      (child) => {
        setOpenKind(null)
        router.push(`/applications/${child.id}`)
      },
    )
    setSubmitting(false)
  }

  const meta = openKind ? KIND_META[openKind] : null

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
        <p className="mr-1 text-xs text-muted-foreground">Siklus baru fasilitas ini</p>
        <Button type="button" variant="outline" size="sm" onClick={() => open('review')}>
          <RefreshCw className="size-3.5" /> {KIND_META.review.cta}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => open('adendum')}>
          <FilePen className="size-3.5" /> {KIND_META.adendum.cta}
        </Button>
      </div>

      <Dialog open={openKind !== null} onOpenChange={(o) => !o && setOpenKind(null)}>
        {meta && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{meta.title}</DialogTitle>
              <DialogDescription>{meta.help}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <label htmlFor="ra-reason" className="text-xs font-medium text-muted-foreground">
                Alasan (opsional — untuk review di luar jadwal)
              </label>
              <Textarea
                id="ra-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Mis. permintaan perubahan tenor dari nasabah, atau pemicu di luar jadwal review…"
                rows={3}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}>
                Batal
              </DialogClose>
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting ? 'Memproses…' : meta.submit}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
