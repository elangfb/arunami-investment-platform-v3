'use client'
import { History } from 'lucide-react'
import { DossierSection } from '@/components/application/DossierSection'
import { Card, CardContent } from '@/components/ui/card'
import { compareHistory } from '@/lib/history'
import type { LoanApplication } from '@/lib/types'
import { cn } from '@/lib/utils'

interface HistoryTabProps {
  app: LoanApplication
}

function formatDate(d: Date) {
  return d.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  })
}

function dotColor(entry: LoanApplication['history'][number]) {
  const action = entry.action.toLowerCase()
  if (action.includes('created')) return 'bg-info'
  if (entry.reason || action.includes('kembalikan') || action.includes('send back')) return 'bg-warning'
  return 'bg-success'
}

export function HistoryTab({ app }: HistoryTabProps) {
  const entries = [...app.history].sort(compareHistory)

  return (
    <DossierSection
      icon={History}
      title="Riwayat"
      note="Jejak audit: aksi, aktor, dan waktu — termasuk alasan pengembalian."
    >
      <Card>
        <CardContent className="pt-6">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada riwayat</p>
          ) : (
            <div className="space-y-0">
              {entries.map((entry, index) => (
                <div key={entry.id} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < entries.length - 1 && <div className="absolute left-2 top-4 h-full w-px bg-border" />}
                  <div className={cn('relative z-10 mt-1 h-4 w-4 rounded-full ring-4 ring-background', dotColor(entry))} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold">{entry.action}</p>
                    <p className="text-sm text-muted-foreground">{entry.userName} · {formatDate(entry.timestamp)}</p>
                    {entry.reason && (
                      <blockquote className="mt-2 rounded-md border-l-4 border-warning bg-warning-subtle px-3 py-2 text-sm text-warning-foreground">
                        {entry.reason}
                      </blockquote>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DossierSection>
  )
}
