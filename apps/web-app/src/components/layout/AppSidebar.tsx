'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  Bell,
  FileText,
  Gavel,
  GitBranch,
  LayoutDashboard,
  LogOut,
  PieChart,
  PlusCircle,
  ShieldCheck,
  UserCog,
  UserMinus,
  Users,
} from 'lucide-react'
import { useActor } from '@/context/ActorProvider'
import { logoutAction } from '@/server/actions/auth'
import { stopImpersonationAction } from '@/server/actions/impersonation'
import { hasDesk } from '@/lib/auth/can'
import { ImpersonateDialog } from '@/components/admin/ImpersonateDialog'
import { MizanIcon } from '@/components/shared/MizanIcon'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

// Keep the brand navy gradient on the (desktop) sidebar surface. The base bg/text
// and the translucent-blue hover come from the --sidebar* tokens already.
const GRADIENT_SURFACE =
  '[&_[data-slot=sidebar-inner]]:bg-gradient-to-b [&_[data-slot=sidebar-inner]]:from-[#0b2a54] [&_[data-slot=sidebar-inner]]:to-[#123667]'

// Restored gradient-pill active treatment (the look the user preferred).
const ACTIVE_PILL =
  'bg-gradient-to-r from-[#2d7ff9] to-[#3b82f6] font-medium text-white shadow-[0_2px_10px_rgba(45,127,249,0.35)] hover:from-[#2d7ff9] hover:to-[#3b82f6] hover:text-white'

// Roomier nav row (the default h-8/p-2 felt cramped).
const NAV_ITEM = 'h-10 gap-3 px-3 text-white/70 transition-colors'

export function AppSidebar({ notifCount = 0 }: { notifCount?: number }) {
  const pathname = usePathname()
  const actor = useActor()
  const { setOpenMobile } = useSidebar()

  const closeMobile = () => setOpenMobile(false)
  const router = useRouter()
  const [stopping, startStop] = useTransition()

  const navItems = [
    { label: 'Aplikasi Baru', href: '/applications/new', icon: PlusCircle, hidden: !hasDesk(actor, 'intake') },
    { label: 'Beranda Saya', href: '/dashboard', icon: LayoutDashboard, hidden: hasDesk(actor, 'MG') },
    { label: 'Pipeline Pembiayaan', href: '/pipeline', icon: GitBranch, hidden: false },
    { label: 'Nasabah', href: '/nasabah', icon: Users, hidden: false },
    { label: 'Semua Aplikasi', href: '/applications', icon: FileText, hidden: false },
    { label: 'Rapat Komite', href: '/komite', icon: Gavel, hidden: !(hasDesk(actor, 'komite') || hasDesk(actor, 'komite-admin') || hasDesk(actor, 'MG')) },
    { label: 'Portofolio', href: '/portofolio', icon: PieChart, hidden: false },
    { label: 'Dashboard Manajemen', href: '/management', icon: BarChart3, hidden: !hasDesk(actor, 'MG') },
    { label: 'Notifikasi', href: '/notifications', icon: Bell, hidden: false },
    { label: 'Konsol Superadmin', href: '/admin', icon: ShieldCheck, hidden: !actor.isSuperadmin },
  ]

  // Only the most-specific matching item is active (so /applications/new doesn't also
  // light up /applications).
  const visibleItems = navItems.filter((item) => !item.hidden)
  const activeHref = visibleItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .reduce((best, item) => (item.href.length > best.length ? item.href : best), '')

  return (
    <Sidebar collapsible="offcanvas" className={cn('border-none', GRADIENT_SURFACE)}>
      <SidebarHeader className="px-4 pb-2 pt-5">
        <div className="flex items-center gap-3">
          <MizanIcon onDark className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-none tracking-tight text-white">MIZAN</h1>
            <p className="mt-1 text-[11px] text-white/50">Hijra Bank</p>
          </div>
          <SidebarTrigger className="text-white/70 hover:bg-white/10 hover:text-white" />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {visibleItems.map((item) => {
                const Icon = item.icon
                const isActive = item.href === activeHref
                const isNotif = item.href === '/notifications'

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      className={cn(NAV_ITEM, isActive && ACTIVE_PILL)}
                      render={
                        <Link
                          href={item.href}
                          onClick={closeMobile}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={item.href === '/applications/new' ? 'New Application / Aplikasi Baru' : item.label}
                        />
                      }
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {isNotif && notifCount > 0 && (
                      <SidebarMenuBadge className="top-1/2! -translate-y-1/2! bg-[#3b82f6] font-semibold text-white">
                        {notifCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Flat footer — user identity (role as text) + a plain "Ganti Peran" link. */}
      <SidebarFooter className="gap-3 px-4 pb-5 pt-2">
        <SidebarSeparator className="mx-0 bg-white/10" />
        <div className="flex items-center gap-3 px-1">
          <Avatar className="size-9">
            <AvatarFallback className="bg-white/15 text-xs text-white">{actor.avatarInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{actor.name}</p>
            <p className="truncate text-xs text-white/50">{actor.title}</p>
          </div>
        </div>
        <SidebarMenu>
          {actor.isSuperadmin && (
            <SidebarMenuItem>
              <ImpersonateDialog
                trigger={
                  <SidebarMenuButton className="h-9 w-full gap-3 px-3 text-white/55 transition-colors hover:text-white">
                    <UserCog />
                    <span>Bertindak sebagai…</span>
                  </SidebarMenuButton>
                }
              />
            </SidebarMenuItem>
          )}
          {actor.impersonating && (
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                disabled={stopping}
                onClick={() =>
                  startStop(async () => {
                    await stopImpersonationAction()
                    closeMobile()
                    router.refresh()
                  })
                }
                className="h-9 w-full gap-3 px-3 text-amber-200/90 transition-colors hover:bg-white/10 hover:text-amber-100"
              >
                <UserMinus />
                <span>Akhiri “Bertindak sebagai…”</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <form action={logoutAction} className="w-full">
              <SidebarMenuButton
                type="submit"
                onClick={closeMobile}
                className="h-9 w-full gap-3 px-3 text-white/55 transition-colors hover:text-white"
              >
                <LogOut />
                <span>Keluar</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
