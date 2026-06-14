'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Page } from '@/components/layout/Page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MeetingScheduler } from '@/components/komite/MeetingScheduler'
import { MeetingList } from '@/components/komite/MeetingList'
import { SessionAgenda } from '@/components/komite/SessionAgenda'
import { DecisionsTable } from '@/components/komite/DecisionsTable'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import type { KomiteMeeting, LoanApplication } from '@/lib/types'

// Client shell for the komite hub. The RSC parent loads applications + meetings
// from the repo; writes (schedule/vote/decide) call server actions, then
// router.refresh() re-runs the parent to pull fresh data (replaces the former
// in-memory bump tick).
export function KomiteClient({ applications, meetings, rooms }: { applications: LoanApplication[]; meetings: KomiteMeeting[]; rooms: string[] }) {
  const actor = useActor()
  const router = useRouter()
  const refresh = () => router.refresh()
  // Batch 8 / ADR-0015: session administration is the sekretariat's (komite-admin = RM), NOT a
  // committee member's. Komite members see read-only schedule + their agenda/sign surface.
  const canSchedule = hasDesk(actor, 'komite-admin')
  const [tab, setTab] = useState(hasDesk(actor, 'MG') || canSchedule ? 'jadwal' : 'agenda')

  return (
    <Page.Root>
      <Page.Header
        title="Rapat Komite Pembiayaan"
        description="Penjadwalan sidang, agenda & tanda tangan MoM, dan riwayat keputusan komite."
      >
        {canSchedule && <MeetingScheduler applications={applications} onScheduled={refresh} rooms={rooms} />}
      </Page.Header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="flex-wrap h-auto gap-x-1">
          <TabsTrigger value="jadwal">Jadwal</TabsTrigger>
          <TabsTrigger value="agenda">Agenda Sidang</TabsTrigger>
          <TabsTrigger value="keputusan">Keputusan</TabsTrigger>
        </TabsList>
        <TabsContent value="jadwal" className="mt-4">
          <MeetingList applications={applications} meetings={meetings} canManage={canSchedule} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="agenda" className="mt-4">
          <SessionAgenda applications={applications} meetings={meetings} />
        </TabsContent>
        <TabsContent value="keputusan" className="mt-4">
          <DecisionsTable applications={applications} meetings={meetings} />
        </TabsContent>
      </Tabs>
    </Page.Root>
  )
}
