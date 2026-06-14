'use client'

import { useState } from 'react'
import { CalendarDays, CalendarClock, CheckCircle2, MapPin, Video, ExternalLink, Crown, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { StatusChip } from '@/components/shared/StatusChip'
import { committeeRoster, isOngoing, meetingVenueLabel } from '@/lib/komite'
import { getUserById } from '@/lib/seed-data'
import { formatRupiah } from '@/lib/sla-utils'
import { runAction } from '@/lib/client-action'
import { cn } from '@/lib/utils'
import { cancelProposedMeetingAction, confirmProposedMeetingAction, editMeetingTimeAction, updateMeetingAttendeesAction } from '@/server/actions/komite'
import type { KomiteMeeting, LoanApplication } from '@/lib/types'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export function MeetingList({ applications, meetings: meetingsProp, canManage = false, onChanged }: { applications: LoanApplication[]; meetings: KomiteMeeting[]; canManage?: boolean; onChanged?: () => void }) {
  const meetings = [...meetingsProp].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

  async function confirm(id: string) {
    await runAction(
      () => confirmProposedMeetingAction(id),
      (meeting) => {
        toast(`Usulan rapat ${meeting.id} dikonfirmasi.`)
        onChanged?.()
      },
    )
  }

  async function cancel(id: string) {
    await runAction(
      () => cancelProposedMeetingAction(id),
      (meeting) => {
        toast(`Usulan rapat ${meeting.id} dibatalkan.`)
        onChanged?.()
      },
    )
  }

  if (meetings.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Belum ada rapat komite yang dijadwalkan.</p>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {meetings.map((m) => {
        const chair = getUserById(m.chairUserId)
        const ongoing = isOngoing(m)
        return (
          <Card key={m.id} className={cn((m.status === 'completed' || m.status === 'cancelled') && 'opacity-80')}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <CalendarDays className="size-4 text-primary" /> {formatDate(m.date)} — {m.time}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    {m.room ? <MapPin className="size-3.5" /> : <Video className="size-3.5" />}
                    {meetingVenueLabel(m)} · <span className="font-mono text-xs">{m.id}</span>
                  </p>
                  {m.meetingUrl && m.status === 'upcoming' && (
                    <a
                      href={m.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <Video className="size-3.5" /> Gabung Rapat <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <StatusChip
                  tone={ongoing ? 'warning' : m.status === 'upcoming' ? 'info' : m.status === 'proposed' ? 'warning' : m.status === 'cancelled' ? 'neutral' : 'success'}
                  icon={m.status === 'cancelled' ? XCircle : m.status === 'completed' ? CheckCircle2 : CalendarClock}
                  label={ongoing ? 'Berlangsung' : m.status === 'upcoming' ? 'Akan Datang' : m.status === 'proposed' ? 'Usulan' : m.status === 'cancelled' ? 'Dibatalkan' : 'Selesai'}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Agenda ({m.agendaAppIds.length} aplikasi)</p>
                {m.agendaAppIds.length === 0 && (
                  <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Belum ada agenda aplikasi.</p>
                )}
                {m.agendaAppIds.map((id) => {
                  const a = applications.find((x) => x.id === id)
                  if (!a) return null
                  return (
                    <div key={id} className="space-y-1 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary">{a.id}</span>
                        <span className="flex-1 truncate font-medium">{a.nasabahName}</span>
                        <span className="tabular-nums text-xs text-muted-foreground">{formatRupiah(a.requestedPlafond)}</span>
                        <AkadBadge akad={a.akadType} />
                      </div>
                      {m.agendaReasons?.[id] && (
                        <p className="text-xs text-muted-foreground">Alasan usulan: {m.agendaReasons[id]}</p>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Anggota Komite</p>
                <div className="flex flex-wrap gap-1.5">
                  {m.attendeeUserIds.map((uid) => {
                    const u = getUserById(uid)
                    if (!u) return null
                    const isChair = uid === m.chairUserId
                    return (
                      <span key={uid} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset', isChair ? 'bg-primary/5 text-primary ring-primary/20' : 'bg-muted text-muted-foreground ring-border')}>
                        {isChair && <Crown className="size-3 text-primary" />} {u.name}{isChair && ' · Ketua'}
                      </span>
                    )
                  })}
                </div>
              </div>

              {m.notes && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{m.notes}</p>}
              {canManage && (m.status === 'proposed' || m.status === 'upcoming') && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                  <AttendeeEditor meeting={m} onChanged={onChanged} />
                  <MeetingTimeEditor meeting={m} onChanged={onChanged} />
                  {m.status === 'proposed' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => void cancel(m.id)}>Batalkan Usulan</Button>
                      <Button size="sm" onClick={() => void confirm(m.id)} disabled={m.agendaAppIds.length === 0}>Konfirmasi Agenda</Button>
                    </>
                  )}
                </div>
              )}
              {chair && <p className="sr-only">Ketua: {chair.name}</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// Reschedule affordance (ADR-0005 #13): editable while proposed/upcoming; the server freezes it once
// any agenda app's MoM is signed. The confirm() is the "notify participants / careful" friction.
function MeetingTimeEditor({ meeting, onChanged }: { meeting: KomiteMeeting; onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(meeting.date)
  const [time, setTime] = useState(meeting.time)
  async function save() {
    if (!window.confirm('Ubah waktu rapat? Pastikan peserta diberi tahu. Waktu terkunci setelah MoM ditandatangani.')) return
    await runAction(
      () => editMeetingTimeAction(meeting.id, date, time),
      () => { setOpen(false); onChanged?.() },
    )
  }
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Ubah Waktu</Button>
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
      <Button size="sm" onClick={() => void save()}>Simpan</Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Batal</Button>
    </div>
  )
}

// Correct real attendance (Batch 8 / gap #19): the sekretariat (komite-admin = RM) drops a no-show
// Komite member so the MoM isn't deadlocked, or adds one who was missed. The chair can't be removed;
// the server freezes the list once any MoM signature lands. Quorum (≥2) is enforced at finalisation.
function AttendeeEditor({ meeting, onChanged }: { meeting: KomiteMeeting; onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  const [ids, setIds] = useState<string[]>(meeting.attendeeUserIds)
  // Candidate roster = the Komite members (CM); added participants stay as-is and aren't toggled here.
  const candidates = committeeRoster()
  function toggle(uid: string) {
    if (uid === meeting.chairUserId) return // chair stays
    setIds((cur) => (cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]))
  }
  async function save() {
    await runAction(
      () => updateMeetingAttendeesAction(meeting.id, ids),
      () => { setOpen(false); onChanged?.() },
    )
  }
  if (!open) return <Button variant="outline" size="sm" onClick={() => { setIds(meeting.attendeeUserIds); setOpen(true) }}>Koreksi Peserta</Button>
  return (
    <div className="w-full space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">Centang anggota Komite yang benar-benar hadir. Ketua tidak bisa dihapus; terkunci setelah MoM ditandatangani.</p>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((u) => {
          const on = ids.includes(u.id)
          const isChair = u.id === meeting.chairUserId
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              disabled={isChair}
              className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ring-1 ring-inset transition-colors', on ? 'bg-primary/10 text-primary ring-primary/30' : 'bg-background text-muted-foreground ring-border', isChair && 'cursor-not-allowed opacity-70')}
              aria-pressed={on}
            >
              {isChair && <Crown className="size-3 text-primary" />}{u.name}{isChair && ' · Ketua'}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" onClick={() => void save()}>Simpan Kehadiran</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </div>
  )
}
