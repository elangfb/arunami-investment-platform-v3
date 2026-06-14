'use client'

import type { ReactNode } from 'react'
import { AppSidebar } from './AppSidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { MizanMark } from '@/components/shared/MizanMark'
import { cn } from '@/lib/utils'

// Content area + reopen affordance. When the desktop sidebar is offcanvas-collapsed
// we (a) show a small floating trigger and (b) reserve a left gutter so it never
// overlaps the page title. Chrome-free while the sidebar is open.
function ShellContent({ children }: { children: ReactNode }) {
  const { state, isMobile } = useSidebar()
  const collapsed = !isMobile && state === 'collapsed'

  return (
    <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden">
      {collapsed && (
        <SidebarTrigger className="fixed left-3 top-3 z-30 bg-card text-foreground shadow-[var(--shadow-card)] ring-1 ring-border hover:bg-muted" />
      )}
      {/* Mobile top bar — opens the Sheet; the desktop rail is shown ≥md */}
      <header className="flex items-center gap-2 border-b bg-card px-4 py-2.5 md:hidden">
        <SidebarTrigger />
        <MizanMark className="size-5 text-primary" />
        <span className="font-bold tracking-tight">MIZAN</span>
      </header>
      <div
        className={cn(
          'flex-1 overflow-y-auto p-4 transition-[padding] duration-200 md:p-6',
          collapsed && 'md:pl-16'
        )}
      >
        {children}
      </div>
    </SidebarInset>
  )
}

/**
 * The persistent app shell — rendered ONCE by the (app) route-group layout, so it
 * survives navigation (sidebar state persists; no remount). Pairs the shadcn
 * Sidebar with SidebarInset (the page <main>).
 */
export function AppShell({
  defaultOpen = true,
  notifCount = 0,
  children,
}: {
  defaultOpen?: boolean
  notifCount?: number
  children: ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen} className="h-svh overflow-hidden">
      <AppSidebar notifCount={notifCount} />
      <ShellContent>{children}</ShellContent>
    </SidebarProvider>
  )
}
