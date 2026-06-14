'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { stopImpersonationAction } from '@/server/actions/impersonation'

// Sticky banner shown across the app while a superadmin is impersonating. Pairs the
// warning colour with an icon + text (WCAG 1.4.1). "Selesai" ends impersonation and
// re-runs the layout so the real superadmin identity is restored.
//
// It renders inside the AppShell scroll container (padding p-4 / md:p-6), so it uses
// negative margins to full-bleed past that padding. The sticky `top` is ALSO negative
// and MUST mirror the container padding (-top-4 / md:-top-6 ↔ p-4 / md:p-6): a sticky
// child of a padded scroller otherwise pins at the content-box edge (below the padding),
// leaving a padding-tall gap above it through which content bleeds while scrolling.
export function ImpersonationBanner({ name, realName }: { name: string; realName: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function stop() {
    start(async () => {
      await stopImpersonationAction()
      router.refresh()
    })
  }

  return (
    <div className="sticky -top-4 z-40 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 md:-top-6 md:-mx-6 md:-mt-6 md:px-6">
      <span className="flex items-center gap-2">
        <UserCog className="size-4 shrink-0" />
        Anda bertindak sebagai <strong>{name}</strong> — a.n. Superadmin {realName}.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-200"
        disabled={pending}
        onClick={stop}
      >
        Selesai
      </Button>
    </div>
  )
}
