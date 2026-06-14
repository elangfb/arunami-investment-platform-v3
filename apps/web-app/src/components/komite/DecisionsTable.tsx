'use client'

import { Card, CardContent } from '@/components/ui/card'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { formatRupiah } from '@/lib/sla-utils'
import type { KomiteMeeting, LoanApplication } from '@/lib/types'

// The decision date: the timestamp of the "Keputusan Komite" history entry,
// falling back to the date of the meeting that carried the app.
function decisionDate(appId: string, history: { action: string; timestamp: Date }[], meetings: KomiteMeeting[]) {
  const entry = history.find((h) => h.action.startsWith('Keputusan Komite'))
  if (entry) return new Date(entry.timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  const meeting = meetings.find((m) => m.agendaAppIds.includes(appId))
  return meeting ? new Date(meeting.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

export function DecisionsTable({ applications, meetings }: { applications: LoanApplication[]; meetings: KomiteMeeting[] }) {
  const decided = applications.filter((a) => a.komiteDecision)
    .sort((a, b) => a.id.localeCompare(b.id))

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold">Keputusan Komite</h2>
          <span className="text-xs text-muted-foreground">{decided.length} keputusan</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2.5 pl-5 pr-4 font-medium">ID</th>
                <th className="py-2.5 pr-4 font-medium">Debitur</th>
                <th className="py-2.5 pr-4 text-right font-medium">Plafond</th>
                <th className="py-2.5 pr-4 font-medium">Tgl Rapat</th>
                <th className="py-2.5 pr-4 font-medium">Keputusan</th>
                <th className="py-2.5 pr-5 font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {decided.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Belum ada keputusan komite yang direkam.</td></tr>
              )}
              {decided.map((a) => {
                const decision = a.komiteDecision
                if (!decision) return null
                return (
                  <tr key={a.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                    <td className="py-3 pl-5 pr-4 font-mono text-xs font-medium text-primary">{a.id}</td>
                    <td className="py-3 pr-4 font-medium">{a.nasabahName}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{formatRupiah(a.approvedPlafond ?? a.requestedPlafond)}</td>
                    <td className="py-3 pr-4 tabular-nums text-muted-foreground">{decisionDate(a.id, a.history, meetings)}</td>
                    <td className="py-3 pr-4">
                      <DecisionChip decision={decision} />
                    </td>
                    <td className="py-3 pr-5 max-w-xs text-xs text-muted-foreground">{a.komiteDecisionNote || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
