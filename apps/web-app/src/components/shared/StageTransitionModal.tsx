'use client'
import { useState } from 'react'
import { CornerUpLeft, ArrowRight, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface StageTransitionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: string         // e.g. "Submit to Risk Review" or "Send Back to Analyst"
  requireReason: boolean // true for send-back actions
  onConfirm: (reason?: string) => void
}

export function StageTransitionModal({
  open, onOpenChange, action, requireReason, onConfirm
}: StageTransitionModalProps) {
  const [reason, setReason] = useState('')

  const canConfirm = !requireReason || reason.trim().length > 0
  // Send-backs require a reason; style them as a deliberate "return" action.
  const isSendBack = requireReason

  function handleConfirm() {
    onConfirm(requireReason ? reason : undefined)
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', isSendBack ? 'bg-amber-50 text-amber-600' : 'bg-accent text-primary')}>
              {isSendBack ? <CornerUpLeft className="size-5" /> : <ArrowRight className="size-5" />}
            </span>
            <div className="space-y-0.5">
              <DialogTitle>{action}</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {isSendBack ? 'Aplikasi akan dikembalikan dengan catatan untuk ditindaklanjuti.' : 'Konfirmasi untuk melanjutkan ke tahap berikutnya.'}
              </p>
            </div>
          </div>
        </DialogHeader>
        {requireReason && (
          <div className="space-y-2 py-1">
            <label className="text-sm font-medium">Alasan <span className="font-normal text-red-500">(wajib)</span></label>
            <Textarea
              placeholder="Contoh: DSR perlu dihitung ulang menggunakan laporan keuangan terbaru Q1 2026"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" /> Tindakan ini tercatat permanen dalam audit trail.
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>Konfirmasi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
