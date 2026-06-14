'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { StatusChip, type StatusTone } from '@/components/shared/StatusChip'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AkadType } from '@/lib/types'
import { formatRupiah } from '@/lib/sla-utils'
import { cn } from '@/lib/utils'

export interface WatchlistRow {
  id: string
  nasabahName: string
  akadType: AkadType
  plafond: number
  outstanding: number
  kol: number
  dueMs: number
  dueLabel: string
}

// Kolektibilitas reuses the status vocabulary: Lancar = success, DPK = warning,
// Macet = danger. (Kol is a status, so it shares the semantic tones.)
function kolTone(kol: number): StatusTone {
  return kol === 1 ? 'success' : kol === 2 ? 'warning' : 'danger'
}
function kolLabel(kol: number): string {
  return kol === 1 ? 'Lancar' : kol === 2 ? 'DPK' : 'Macet'
}

type SortKey = 'kol' | 'plafond' | 'outstanding' | 'due'
type SortDir = 'asc' | 'desc'

const FILTERS = [
  { value: 'all', label: 'Semua kolektibilitas' },
  { value: '1', label: 'Lancar (Kol 1)' },
  { value: '2', label: 'DPK (Kol 2)' },
  { value: '3', label: 'Macet (Kol ≥3)' },
] as const

function SortHead({ k, label, className, sort, onToggle }: {
  k: SortKey
  label: string
  className?: string
  sort: { key: SortKey; dir: SortDir }
  onToggle: (k: SortKey) => void
}) {
  return (
    <th className={cn('py-2.5 pr-4 font-medium', className)}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', sort.key === k && 'text-foreground')}
      >
        {label}
        {sort.key === k ? (
          sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ChevronsUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  )
}

export function WatchlistTable({ rows }: { rows: WatchlistRow[] }) {
  // Default: worst kolektibilitas first — the early-warning job.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'kol', dir: 'desc' })
  const [filter, setFilter] = useState<string>('all')

  const view = useMemo(() => {
    const filtered = rows.filter((r) => filter === 'all' || (filter === '3' ? r.kol >= 3 : r.kol === Number(filter)))
    const val = (r: WatchlistRow) =>
      sort.key === 'kol' ? r.kol : sort.key === 'plafond' ? r.plafond : sort.key === 'outstanding' ? r.outstanding : r.dueMs
    return filtered.sort((a, b) => (sort.dir === 'asc' ? val(a) - val(b) : val(b) - val(a)))
  }, [rows, filter, sort])

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-base font-medium">Fasilitas Dicairkan</h2>
            <p className="text-xs text-muted-foreground">{view.length} dari {rows.length} fasilitas</p>
          </div>
          <Select value={filter} onValueChange={(value) => setFilter(value ?? 'all')}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue>{FILTERS.find((f) => f.value === filter)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {view.length === 0 ? (
          <div className="px-5 pb-6">
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'Belum ada fasilitas yang dicairkan.'
                : 'Tidak ada fasilitas pada filter ini.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-5 pr-4 font-medium">ID</th>
                  <th className="py-2.5 pr-4 font-medium">Debitur</th>
                  <th className="py-2.5 pr-4 font-medium">Akad</th>
                  <SortHead k="plafond" label="Plafond" className="text-right" sort={sort} onToggle={toggleSort} />
                  <SortHead k="outstanding" label="Outstanding" className="text-right" sort={sort} onToggle={toggleSort} />
                  <SortHead k="kol" label="Kolektibilitas" sort={sort} onToggle={toggleSort} />
                  <SortHead k="due" label="Jatuh Tempo" sort={sort} onToggle={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {view.map((row) => (
                  <tr
                    key={row.id}
                    className={cn('border-b last:border-0 transition-colors hover:bg-muted/30', row.kol >= 3 && 'bg-danger-subtle/50')}
                  >
                    <td className="py-3 pl-5 pr-4">
                      <Link href={`/applications/${row.id}?view=ringkasan`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {row.id}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 font-medium">{row.nasabahName}</td>
                    <td className="py-3 pr-4"><AkadBadge akad={row.akadType} /></td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(row.plafond)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(row.outstanding)}</td>
                    <td className="py-3 pr-4"><StatusChip tone={kolTone(row.kol)} label={kolLabel(row.kol)} /></td>
                    <td className="py-3 pr-5 tabular-nums text-muted-foreground">{row.dueLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
