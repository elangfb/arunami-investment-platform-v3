'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Inbox, PlusCircle } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { ApplicationCard } from '@/components/kanban/ApplicationCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActor } from '@/context/ActorProvider'
import { canActOnDesk, hasDesk } from '@/lib/auth/can'
import { EmptyState } from '@/components/ui/empty-state'
import { STAGE_NAMES, type LoanApplication, type Stage } from '@/lib/types'

const STAGES: Stage[] = [1, 2, 3, 4, 5, 6]

export function ApplicationsListClient({ applications }: { applications: LoanApplication[] }) {
  const actor = useActor()
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [mine, setMine] = useState(false)

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return applications.filter((app) => {
      const matchesSearch =
        query.length === 0 ||
        app.id.toLowerCase().includes(query) ||
        app.nasabahName.toLowerCase().includes(query)
      const matchesStage = stageFilter === 'all' || app.stage === Number(stageFilter)
      return matchesSearch && matchesStage && (!mine || canActOnDesk(actor, app))
    })
  }, [applications, searchQuery, stageFilter, mine, actor])

  return (
    <Page.Root>
      <Page.Header title="Daftar Aplikasi" description="Semua aplikasi pembiayaan di Mizan.">
        {hasDesk(actor, 'intake') && (
          <Link href="/applications/new">
            <Button><PlusCircle className="mr-2 size-4" />Buat Aplikasi</Button>
          </Link>
        )}
      </Page.Header>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cari nasabah atau ID..."
            className="w-full sm:w-[280px]"
          />
          <Select value={stageFilter} onValueChange={(value) => setStageFilter(value ?? 'all')}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue>{stageFilter === 'all' ? 'Semua Tahap' : STAGE_NAMES[Number(stageFilter) as Stage]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tahap</SelectItem>
              {STAGES.map((stage) => (
                <SelectItem key={stage} value={String(stage)}>{stage}. {STAGE_NAMES[stage]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => setMine((v) => !v)}
            aria-pressed={mine}
            className={
              'inline-flex h-9 shrink-0 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors ' +
              (mine ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted')
            }
          >
            Tugas saya
          </button>
        </div>

        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredApplications.map((app) => (
            <ApplicationCard key={app.id} app={app} showOwner />
          ))}
        </div>

        {filteredApplications.length === 0 && (
          <EmptyState icon={Inbox} title="Tidak ada aplikasi" description="Tidak ada aplikasi yang cocok dengan filter." />
        )}
    </Page.Root>
  )
}
