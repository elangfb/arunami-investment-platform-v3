'use client'

import { useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DossierNav } from '@/components/application/DossierNav'
import { DossierContent } from '@/components/application/DossierContent'
import { VIEW_LABELS, type DetailView } from '@/lib/detail-nav'
import type { LoanApplication } from '@/lib/types'

// The two-pane "dossier": a grouped section nav driving the active surface.
// Desktop keeps the nav as a sticky left rail; below lg it collapses into a Sheet
// opened by a "Bagian" button, so the case stays navigable on a phone (the CM /
// Komite mobile path). The cockpit above renders first, so a mobile reviewer sees
// identity + task + committee decision before ever opening the nav.
export function DossierLayout({
  app,
  onUpdate,
  view,
  onViewChange,
}: {
  app: LoanApplication
  onUpdate: (a: LoanApplication) => void
  view: DetailView
  onViewChange: (v: DetailView) => void
}) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6">
      {/* Desktop: sticky left rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-0 self-start rounded-xl border border-border/70 bg-card p-3 shadow-[var(--shadow-card)]">
          <DossierNav app={app} view={view} onViewChange={onViewChange} />
        </div>
      </aside>

      {/* Mobile/tablet: a trigger that opens the nav in a Sheet */}
      <div className="mb-3 lg:hidden">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" className="w-full justify-start gap-2">
                <PanelLeft className="size-4" />
                <span className="text-muted-foreground">Bagian:</span>
                <span className="font-medium">{VIEW_LABELS[view]}</span>
              </Button>
            }
          />
          <SheetContent side="left" className="w-72 overflow-y-auto p-3">
            <SheetHeader className="p-0 pb-2">
              <SheetTitle>Bagian Aplikasi</SheetTitle>
            </SheetHeader>
            <DossierNav
              app={app}
              view={view}
              onViewChange={(v) => {
                onViewChange(v)
                setNavOpen(false)
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      <div className="min-w-0">
        <DossierContent app={app} onUpdate={onUpdate} view={view} onViewChange={onViewChange} />
      </div>
    </div>
  )
}
