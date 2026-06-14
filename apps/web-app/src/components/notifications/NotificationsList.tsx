'use client'
import { useMemo, useState, type ComponentType } from 'react'
import Link from 'next/link'
import { OctagonAlert, TriangleAlert, Info, Clock, ScanLine, FileText, Gavel, AtSign, PenLine, Megaphone, CalendarClock, ChevronRight, BellOff, Inbox } from 'lucide-react'
import { StatusChip } from '@/components/shared/StatusChip'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { NotificationSeverity, NotificationCategory } from '@/lib/notifications'
import { cn } from '@/lib/utils'

// Server-serialized notification (relative time pre-formatted to avoid an
// SSR/hydration clock mismatch). The list is already severity-sorted upstream.
export interface NotificationView {
  id: string
  title: string
  description: string
  severity: NotificationSeverity
  category: NotificationCategory
  appId: string
  nasabahName: string
  relativeTime: string
  href: string
  cta: string
}

// Severity is encoded by SHAPE as well as colour (WCAG 1.4.1 — never colour
// alone): octagon = danger, triangle = warning, circle = info. The distinct
// silhouettes stay legible to colour-blind users. The icon chip is also tinted
// in the severity tone, and the left rail reinforces it.
const SEVERITY: Record<NotificationSeverity, { rail: string; chip: string; icon: ComponentType<{ className?: string }>; label: string }> = {
  danger: { rail: 'border-l-danger', chip: 'bg-danger-subtle text-danger-foreground', icon: OctagonAlert, label: 'Terlewati' },
  warning: { rail: 'border-l-warning', chip: 'bg-warning-subtle text-warning-foreground', icon: TriangleAlert, label: 'Berisiko' },
  info: { rail: 'border-l-info', chip: 'bg-info-subtle text-info-foreground', icon: Info, label: 'Info' },
}

// Category is secondary (the title already names it) — a small muted glyph for
// scent: SLA = clock, OCR = scan, dokumen = file.
const CATEGORY_ICON: Record<NotificationCategory, ComponentType<{ className?: string }>> = {
  sla: Clock,
  ocr: ScanLine,
  docs: FileText,
  mom: Gavel,
  mention: AtSign,
  approval: PenLine,
  colek: Megaphone,
  review: CalendarClock,
}
const SEVERITY_RANK: Record<NotificationSeverity, number> = { danger: 0, warning: 1, info: 2 }

type Filter = 'all' | NotificationSeverity

export function NotificationsList({ items }: { items: NotificationView[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(
    () => ({
      all: items.length,
      danger: items.filter((i) => i.severity === 'danger').length,
      warning: items.filter((i) => i.severity === 'warning').length,
      info: items.filter((i) => i.severity === 'info').length,
    }),
    [items],
  )

  const view = filter === 'all' ? items : items.filter((i) => i.severity === filter)

  // Group the filtered view by appId; order groups by their worst severity then
  // by first appearance in the upstream severity-sorted list (most-urgent first).
  const groups = useMemo(() => {
    const map = new Map<string, { appId: string; nasabahName: string; items: NotificationView[]; firstIdx: number }>()
    view.forEach((item, idx) => {
      const existing = map.get(item.appId)
      if (existing) existing.items.push(item)
      else map.set(item.appId, { appId: item.appId, nasabahName: item.nasabahName, items: [item], firstIdx: idx })
    })
    return Array.from(map.values()).sort((a, b) => {
      const aWorst = Math.min(...a.items.map((i) => SEVERITY_RANK[i.severity]))
      const bWorst = Math.min(...b.items.map((i) => SEVERITY_RANK[i.severity]))
      return aWorst !== bWorst ? aWorst - bWorst : a.firstIdx - b.firstIdx
    })
  }, [view])

  const chips: { key: Filter; label: string; count: number; icon: ComponentType<{ className?: string }> }[] = [
    { key: 'all', label: 'Semua', count: counts.all, icon: Inbox },
    { key: 'danger', label: 'Terlewati', count: counts.danger, icon: OctagonAlert },
    { key: 'warning', label: 'Berisiko', count: counts.warning, icon: TriangleAlert },
    { key: 'info', label: 'Info', count: counts.info, icon: Info },
  ]

  if (items.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 py-12 text-center">
        <BellOff className="size-7 text-muted-foreground/50" />
        <p className="text-sm font-medium">Tidak ada notifikasi aktif</p>
        <p className="text-xs text-muted-foreground">Semua aplikasi sedang dalam SLA dan tidak ada yang perlu ditindaklanjuti.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Severity summary / filter strip — icon + label + count, so the legend
          is shape-coded too (not colour-only). */}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              disabled={c.key !== 'all' && c.count === 0}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                filter === c.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" />
              {c.label}
              <span className={cn('tabular-nums', filter === c.key ? 'text-primary-foreground/80' : 'text-foreground')}>{c.count}</span>
            </button>
          )
        })}
      </div>

      {/* Per-application clusters — each group gets a slim section header
          (shape-coded worst-severity icon + nasabahName + appId + count badge)
          followed by the existing item cards. Groups ordered worst-severity
          first, then by first-appearance in the upstream sorted list. */}
      <div className="stagger space-y-4">
        {groups.map((group) => {
          // Worst severity present in the group (danger > warning > info), without an assertion.
          const severityOrder: NotificationSeverity[] = ['danger', 'warning', 'info']
          const worstSev = severityOrder.find((s) => group.items.some((i) => i.severity === s)) ?? 'info'
          const WorstIcon = SEVERITY[worstSev].icon
          return (
            <div key={group.appId} className="space-y-2">
              {/* Section header — restrained: icon chip + name + id + count */}
              <div className="flex items-center gap-2 px-1">
                <span
                  className={cn('flex size-5 shrink-0 items-center justify-center rounded', SEVERITY[worstSev].chip)}
                  role="img"
                  aria-label={`Tingkat terparah: ${SEVERITY[worstSev].label}`}
                >
                  <WorstIcon className="size-3" />
                </span>
                <span className="text-sm font-medium leading-none">{group.nasabahName}</span>
                <StatusChip tone="neutral" label={group.appId} dot={false} />
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {group.items.length}
                </span>
              </div>
              {/* Notification cards for this application */}
              <div className="space-y-2.5">
                {group.items.map((item) => {
                  const sev = SEVERITY[item.severity]
                  const SevIcon = sev.icon
                  const CatIcon = CATEGORY_ICON[item.category]
                  return (
                    <Card key={item.id} className={cn('border-l-[3px] p-0 transition-colors hover:bg-accent/30', sev.rail)}>
                      <div className="flex items-start gap-3 p-4">
                        <span
                          className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', sev.chip)}
                          role="img"
                          aria-label={`Tingkat: ${sev.label}`}
                        >
                          <SevIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="size-1.5 rounded-full bg-primary" aria-label="Belum ditindaklanjuti" />
                            <span className="font-medium">{item.title}</span>
                            <StatusChip tone="neutral" label={item.appId} dot={false} />
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CatIcon className="size-3" />
                              {item.relativeTime}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                          <div className="pt-1">
                            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={item.href} />}>
                              {item.cta}
                              <ChevronRight className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {view.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Tidak ada notifikasi pada filter ini.
        </div>
      )}
    </div>
  )
}
