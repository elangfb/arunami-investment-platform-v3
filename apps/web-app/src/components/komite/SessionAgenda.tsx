'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { StatusChip } from '@/components/shared/StatusChip'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { committeeOf, meetingVenueLabel } from '@/lib/komite'
import { formatRupiah } from '@/lib/sla-utils'
import type { KomiteMeeting, LoanApplication } from '@/lib/types'
import { cn } from '@/lib/utils'

// Read-only committee agenda (ADR-0005 — no in-app voting). Lists the apps on each upcoming meeting
// still awaiting committee finalisation, with their decision/MoM-signature status, linking into the
// Ruang Komite where the Ketua records the outcome and Komite QR-sign the MoM.
export function SessionAgenda({ applications, meetings }: { applications: LoanApplication[]; meetings: KomiteMeeting[] }) {
  const upcoming = [...meetings]
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

  const sessions = upcoming
    .map((m) => ({
      meeting: m,
      committee: committeeOf(m),
      apps: m.agendaAppIds
        .map((id) => applications.find((a) => a.id === id))
        .filter((a): a is LoanApplication => a !== undefined && a.stage === 5 && a.applicationStatus !== 'closed'),
    }))
    .filter((s) => s.committee && s.apps.length > 0)

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><CalendarDays className="size-6" /></div>
        <p className="font-medium">Tidak ada agenda sidang</p>
        <p className="mt-1 text-sm text-muted-foreground">Belum ada aplikasi pada agenda rapat komite yang akan datang.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {sessions.map(({ meeting, committee, apps }) => {
        if (!committee) return null
        const required = committee.attendees.filter((a) => a.role === 'CM')
        return (
          <section key={meeting.id} className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              <span className="font-medium text-foreground">{new Date(meeting.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} {meeting.time}</span>
              · {meetingVenueLabel(meeting)} · <span className="font-mono text-xs">{meeting.id}</span>
            </div>

            <div className="grid gap-3">
              {apps.map((app) => {
                const signed = new Set((app.approvalSteps ?? []).filter((s) => s.chain === 'mom').map((s) => s.userId))
                const signedCount = required.filter((r) => signed.has(r.id)).length
                return (
                  <Card key={app.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-semibold"><span className="font-mono text-xs text-primary">{app.id}</span> · {app.nasabahName}</p>
                        <p className="text-xs text-muted-foreground">{formatRupiah(app.requestedPlafond)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <AkadBadge akad={app.akadType} />
                        {app.komiteDecision ? (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <DecisionChip decision={app.komiteDecision} /> · TTD MoM {signedCount}/{required.length}
                          </span>
                        ) : (
                          <StatusChip tone="neutral" label="Belum diputuskan" />
                        )}
                        <Link href={`/applications/${app.id}/komite`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                          Buka Ruang Komite <ArrowRight className="size-3.5" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
