'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Check, Crown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AkadBadge } from '@/components/shared/AkadBadge'
import { committeeRoster } from '@/lib/komite'
import { scheduleMeetingAction } from '@/server/actions/komite'
import { getUserById } from '@/lib/seed-data'
import { roleSopLabel } from '@/lib/role-labels'
import { formatRupiah } from '@/lib/sla-utils'
import type { LoanApplication } from '@/lib/types'
import { cn } from '@/lib/utils'

// Sentinel for an online-only meeting (no physical room). Maps to room=undefined on save.
const NO_ROOM = 'none'

export function MeetingScheduler({ applications, onScheduled, rooms }: { applications: LoanApplication[]; onScheduled: () => void; rooms: string[] }) {
  const ROOM_ITEMS = useMemo(() => ({ [NO_ROOM]: 'Tanpa ruangan — rapat daring', ...Object.fromEntries(rooms.map((r) => [r, r])) }), [rooms])
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [room, setRoom] = useState<string>(rooms[0] ?? NO_ROOM)
  const [meetingUrl, setMeetingUrl] = useState('')
  const [agenda, setAgenda] = useState<string[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [participants, setParticipants] = useState<string[]>([])
  const [chairId, setChairId] = useState('')
  const [notes, setNotes] = useState('')

  // Stage-5 applications are the schedulable agenda. Skip Risk-vetoed apps —
  // they never reach the committee floor.
  const stage5 = applications.filter((a) => a.stage === 5 && a.riskRecommendation !== 'reject' && !a.komiteDecision)
  const roster = useMemo(() => committeeRoster(), [])
  const attendees = useMemo(() => roster.filter((u) => members.includes(u.id)), [roster, members])
  // Added participants = the involved team of the chosen agenda apps (assignments + signature ledger),
  // excluding Komite (who are the deciding members). They attest the MoM, non-blocking (ADR-0005 #9).
  const involvedTeam = useMemo(() => {
    const ids = new Set<string>()
    for (const a of applications) {
      if (!agenda.includes(a.id)) continue
      for (const asg of a.assignments ?? []) if (asg.userId) ids.add(asg.userId)
      for (const s of a.approvalSteps ?? []) ids.add(s.userId)
    }
    return [...ids].flatMap((id) => { const u = getUserById(id); return u && u.role !== 'CM' ? [u] : [] })
  }, [applications, agenda])
  // Base UI Select needs a stable `items` reference — rebuild only when the
  // attendee set changes (members toggled), not every render.
  const chairItems = useMemo(() => Object.fromEntries(attendees.map((u) => [u.id, u.name])), [attendees])
  // Venue: a physical room and/or an online link. Modality is implicit — at least
  // one must be present (a meeting with neither has no place to convene).
  const roomValue = room === NO_ROOM ? undefined : room
  const hasVenue = Boolean(roomValue) || meetingUrl.trim().length > 0
  const canSubmit = Boolean(date) && hasVenue && agenda.length > 0 && attendees.length >= 2 && Boolean(chairId) && members.includes(chairId)

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  function toggleMember(id: string) {
    const next = members.includes(id) ? members.filter((x) => x !== id) : [...members, id]
    setMembers(next)
    // Clearing the member who was chair drops the chair selection.
    if (!next.includes(chairId)) setChairId('')
  }

  function reset() {
    setDate(''); setTime('09:00'); setRoom(rooms[0] ?? NO_ROOM); setMeetingUrl(''); setAgenda([]); setMembers([]); setParticipants([]); setChairId(''); setNotes('')
  }

  async function submit() {
    if (!canSubmit) return
    const meeting = await scheduleMeetingAction(
      { date, time, room: roomValue, meetingUrl: meetingUrl.trim() || undefined, agendaAppIds: agenda, attendeeUserIds: [...members, ...participants], chairUserId: chairId, notes },
    )
    toast(`Rapat ${meeting.id} dijadwalkan — ${agenda.length} aplikasi`)
    reset()
    setOpen(false)
    onScheduled()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <Button onClick={() => setOpen(true)}><CalendarPlus className="size-4" /> Jadwalkan Rapat</Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jadwalkan Rapat Komite</DialogTitle>
          <p className="text-sm text-muted-foreground">Pilih agenda aplikasi, susun anggota komite, dan tunjuk ketua rapat untuk sidang ini.</p>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm font-medium">
              Tanggal Rapat
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Waktu
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <div className="space-y-1.5 text-sm font-medium">
              Ruangan
              <Select value={room} onValueChange={(v) => v && setRoom(v)} items={ROOM_ITEMS}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROOM}>Tanpa ruangan — rapat daring</SelectItem>
                  {rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            <span>Tautan Rapat <span className="font-normal text-muted-foreground">(untuk rapat daring / hybrid)</span></span>
            <Input type="url" inputMode="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://zoom.us/j/..." />
            <span className="text-xs font-normal text-muted-foreground">Pilih ruangan untuk tatap muka, isi tautan untuk daring, atau keduanya untuk hybrid.</span>
          </label>

          <section className="space-y-2">
            <p className="text-sm font-medium">Agenda — Pilih Aplikasi <span className="text-muted-foreground">({agenda.length} dipilih)</span></p>
            {stage5.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Tidak ada aplikasi di tahap Rapat Komite yang menunggu dijadwalkan.</p>
            ) : (
              <div className="space-y-1.5">
                {stage5.map((a) => {
                  const on = agenda.includes(a.id)
                  return (
                    <button key={a.id} type="button" onClick={() => toggle(agenda, setAgenda, a.id)}
                      className={cn('flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors', on ? 'border-primary bg-accent' : 'hover:bg-muted/50')}>
                      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                        {on && <Check className="size-3.5" />}
                      </span>
                      <span className="flex-1">
                        <span className="font-mono text-xs text-primary">{a.id}</span> · <span className="font-medium">{a.nasabahName}</span>
                        <span className="block text-xs text-muted-foreground">{formatRupiah(a.requestedPlafond)}</span>
                      </span>
                      <AkadBadge akad={a.akadType} />
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Anggota Komite <span className="text-muted-foreground">({attendees.length} dipilih)</span></p>
            <div className="flex flex-wrap gap-2">
              {roster.map((u) => {
                const on = members.includes(u.id)
                return (
                  <button key={u.id} type="button" onClick={() => toggleMember(u.id)}
                    className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-primary bg-accent font-medium' : 'hover:bg-muted/50')}>
                    {on && <Check className="size-3.5" />} {u.name}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Peserta Tambahan (tim terlibat) <span className="text-muted-foreground">({participants.length})</span></p>
              {involvedTeam.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setParticipants(involvedTeam.map((u) => u.id))}>Tambah Semua Tim Terlibat</Button>
              )}
            </div>
            {involvedTeam.length === 0 ? (
              <p className="text-xs text-muted-foreground">Pilih agenda dulu — tim yang terlibat di aplikasi muncul di sini untuk ditambahkan (atau pilih per orang).</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {involvedTeam.map((u) => {
                  const on = participants.includes(u.id)
                  return (
                    <button key={u.id} type="button" onClick={() => toggle(participants, setParticipants, u.id)}
                      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-primary bg-accent font-medium' : 'hover:bg-muted/50')}>
                      {on && <Check className="size-3.5" />} {u.name} <span className="text-xs text-muted-foreground">· {roleSopLabel(u.role)}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Peserta tambahan menandatangani MoM sebagai atestasi (tidak memblokir — hanya Komite yang wajib).</p>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Ketua Rapat</p>
            {attendees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Pilih anggota komite terlebih dahulu untuk menunjuk ketua.</p>
            ) : (
              <Select value={chairId} onValueChange={(v) => v && setChairId(v)} items={chairItems}>
                <SelectTrigger className="w-full sm:max-w-xs">
                  <Crown className="size-3.5 text-primary" />
                  <SelectValue placeholder="Pilih ketua rapat" />
                </SelectTrigger>
                <SelectContent>
                  {attendees.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </section>

          <label className="space-y-1.5 text-sm font-medium">
            Catatan Tambahan
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda atau catatan untuk peserta rapat (opsional)" rows={2} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); reset() }}>Batal</Button>
          <Button onClick={submit} disabled={!canSubmit}>Jadwalkan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
