'use client'

import { cloneElement, useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DESK_CATALOG } from '@/lib/desks'
import { impersonateAction } from '@/server/actions/impersonation'

// Superadmin-only "Bertindak sebagai desk" picker. Starting impersonation re-runs the
// (app) layout (router.refresh) so verifySession picks up the impersonation cookie and
// the rest of the app renders AS the chosen desk. Per-user impersonation lives in the
// admin Users tab; this footer control covers the 8 desk personas (the common case for
// exercising role-specific UI).
export function ImpersonateDialog({ trigger }: { trigger: ReactElement<{ onClick?: () => void }> }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function act(desk: string) {
    start(async () => {
      try {
        await impersonateAction(`desk:${desk}`)
        setOpen(false)
        router.refresh()
      } catch (e) {
        toast.error((e as Error).message || 'Gagal memulai mode bertindak sebagai.')
      }
    })
  }

  return (
    <>
      {cloneElement(trigger, { onClick: () => setOpen(true) })}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>Bertindak sebagai desk</DialogTitle>
          <DialogDescription>
            Lihat dan jalankan aplikasi persis seperti pemegang desk ini. Setiap tindakan tetap tercatat di jejak
            audit sebagai &ldquo;a.n. Superadmin&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {DESK_CATALOG.map((d) => (
            <Button
              key={d.desk}
              variant="outline"
              className="h-auto w-full justify-between gap-3 py-2.5 text-left"
              disabled={pending}
              onClick={() => act(d.desk)}
            >
              <span className="min-w-0 truncate font-medium">{d.label}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{d.desk}</span>
            </Button>
          ))}
        </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
