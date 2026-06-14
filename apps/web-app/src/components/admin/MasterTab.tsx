'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { STAGE_NAMES } from '@/lib/types'
import type { Stage } from '@/lib/types'
import { STAGES } from '@/lib/config/sla-policy'
import {
  createCommitteeRoomsVersionAction,
  createDisbursementConditionsVersionAction,
  createHolidayCalendarVersionAction,
  createSlaPolicyVersionAction,
  refreshHolidaysFromApiAction,
} from '@/server/actions/master'
import type { SlaPolicyVersionRow } from '@/server/config/sla'
import type { CommitteeRoomsVersionRow } from '@/server/config/rooms'
import type { DisbursementConditionsVersionRow } from '@/server/config/disbursement'
import type { HolidayCalendarVersionRow } from '@/server/config/holidays'
import type { MeetingScheduleTemplate } from '@/lib/config/schedule-template-input'
import { runMeetingMaterializerAction } from '@/server/actions/scheduling'
import { CalendarClock } from 'lucide-react'

// Master (reference data) tab — Phase A. Edits the versioned SLA targets: a save appends a
// NEW version (append-only audit), then the active config recomputes live on the next read.
export function MasterTab({
  slaTargets,
  slaVersions,
  rooms,
  roomsVersions,
  disbursementConditions,
  disbursementConditionsVersions,
  scheduleTemplates,
  holidayVersions,
  onChanged,
}: {
  slaTargets: Record<Stage, number>
  slaVersions: SlaPolicyVersionRow[]
  rooms: string[]
  roomsVersions: CommitteeRoomsVersionRow[]
  disbursementConditions: string[]
  disbursementConditionsVersions: DisbursementConditionsVersionRow[]
  scheduleTemplates: MeetingScheduleTemplate[]
  holidayVersions: HolidayCalendarVersionRow[]
  onChanged: () => void
}) {
  const [draft, setDraft] = useState<Record<Stage, string>>(
    () => Object.fromEntries(STAGES.map((s) => [s, String(slaTargets[s])])) as Record<Stage, string>,
  )
  const [reason, setReason] = useState('')
  const [roomsDraft, setRoomsDraft] = useState<string[]>(() => (rooms.length > 0 ? [...rooms] : ['']))
  const [roomsReason, setRoomsReason] = useState('')
  const [conditionsDraft, setConditionsDraft] = useState<string[]>(() =>
    disbursementConditions.length > 0 ? [...disbursementConditions] : [''],
  )
  const [conditionsReason, setConditionsReason] = useState('')
  const [holidayAdded, setHolidayAdded] = useState('')
  const [holidayRemoved, setHolidayRemoved] = useState('')
  const [holidayReason, setHolidayReason] = useState('')
  const [apiYear, setApiYear] = useState(() => new Date().getFullYear())
  const [isPending, startTransition] = useTransition()

  const dirty = STAGES.some((s) => Number(draft[s]) !== slaTargets[s])
  const roomsDirty = roomsDraft.length !== rooms.length || roomsDraft.some((room, i) => room !== rooms[i])
  const conditionsDirty =
    conditionsDraft.length !== disbursementConditions.length ||
    conditionsDraft.some((condition, i) => condition !== disbursementConditions[i])

  function save() {
    const targets = Object.fromEntries(STAGES.map((s) => [s, Number(draft[s])]))
    startTransition(async () => {
      try {
        await createSlaPolicyVersionAction(targets, reason)
        setReason('')
        toast.success('Versi SLA baru disimpan.')
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function saveRooms() {
    startTransition(async () => {
      try {
        await createCommitteeRoomsVersionAction(roomsDraft, roomsReason)
        setRoomsReason('')
        toast.success('Versi ruang komite baru disimpan.')
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function saveConditions() {
    startTransition(async () => {
      try {
        await createDisbursementConditionsVersionAction(conditionsDraft, conditionsReason)
        setConditionsReason('')
        toast.success('Versi syarat pencairan baru disimpan.')
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function saveHoliday() {
    const parseDates = (raw: string): string[] =>
      raw
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    startTransition(async () => {
      try {
        await createHolidayCalendarVersionAction(parseDates(holidayAdded), parseDates(holidayRemoved), holidayReason || undefined)
        setHolidayAdded('')
        setHolidayRemoved('')
        setHolidayReason('')
        toast.success('Versi kalender hari libur baru disimpan.')
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  function refreshFromApi() {
    startTransition(async () => {
      try {
        const result = await refreshHolidaysFromApiAction(apiYear)
        if (result.ok) {
          toast.success('Kalender diperbarui dari API.')
          onChanged()
        } else {
          toast.warning('Gagal mengambil dari API — kalender tetap.')
        }
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="font-heading text-lg font-semibold">Target SLA per tahap (hari)</h3>
            <p className="text-sm text-muted-foreground">
              Menyimpan akan membuat versi baru (audit append-only). Perubahan langsung berlaku untuk
              aplikasi yang sedang berjalan.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STAGES.map((s) => (
              <label key={s} className="flex flex-col gap-1">
                <span className="text-sm font-medium">
                  Tahap {s} <span className="text-muted-foreground">· {STAGE_NAMES[s]}</span>
                </span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  value={draft[s]}
                  disabled={isPending}
                  onChange={(e) => setDraft((d) => ({ ...d, [s]: e.target.value }))}
                  aria-label={`Target SLA tahap ${s} (hari)`}
                />
              </label>
            ))}
          </div>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan perubahan (opsional, masuk ke catatan audit)"
            aria-label="Alasan perubahan"
            disabled={isPending}
          />
          <Button type="button" onClick={save} disabled={!dirty || isPending}>
            Simpan versi baru
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="font-heading text-lg font-semibold">Ruang Komite</h3>
            <p className="text-sm text-muted-foreground">
              Menyimpan akan membuat versi baru (audit append-only). Perubahan langsung berlaku untuk
              aplikasi yang sedang berjalan.
            </p>
          </div>
          <div className="space-y-2">
            {roomsDraft.map((room, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={room}
                  disabled={isPending}
                  onChange={(e) => setRoomsDraft((draft) => draft.map((item, i) => (i === index ? e.target.value : item)))}
                  placeholder="Nama ruang komite"
                  aria-label={`Nama ruang komite ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRoomsDraft((draft) => draft.filter((_, i) => i !== index))}
                  disabled={isPending || roomsDraft.length <= 1}
                >
                  Hapus
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => setRoomsDraft((draft) => [...draft, ''])} disabled={isPending}>
            Tambah ruang
          </Button>
          <Input
            value={roomsReason}
            onChange={(e) => setRoomsReason(e.target.value)}
            placeholder="Alasan perubahan (opsional, masuk ke catatan audit)"
            aria-label="Alasan perubahan ruang komite"
            disabled={isPending}
          />
          <Button type="button" onClick={saveRooms} disabled={!roomsDirty || isPending}>
            Simpan versi baru
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="font-heading text-lg font-semibold">Syarat Pencairan</h3>
            <p className="text-sm text-muted-foreground">
              Menyimpan akan membuat versi baru (audit append-only). Perubahan langsung berlaku untuk
              aplikasi yang sedang berjalan.
            </p>
          </div>
          <div className="space-y-2">
            {conditionsDraft.map((condition, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={condition}
                  disabled={isPending}
                  onChange={(e) =>
                    setConditionsDraft((draft) => draft.map((item, i) => (i === index ? e.target.value : item)))
                  }
                  placeholder="Syarat pencairan"
                  aria-label={`Syarat pencairan ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConditionsDraft((draft) => draft.filter((_, i) => i !== index))}
                  disabled={isPending || conditionsDraft.length <= 1}
                >
                  Hapus
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConditionsDraft((draft) => [...draft, ''])}
            disabled={isPending}
          >
            Tambah syarat
          </Button>
          <Input
            value={conditionsReason}
            onChange={(e) => setConditionsReason(e.target.value)}
            placeholder="Alasan perubahan (opsional, masuk ke catatan audit)"
            aria-label="Alasan perubahan syarat pencairan"
            disabled={isPending}
          />
          <Button type="button" onClick={saveConditions} disabled={!conditionsDirty || isPending}>
            Simpan versi baru
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">Riwayat versi ruang komite</h3>
          {roomsVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada versi.</p>
          ) : (
            <ul className="space-y-2">
              {roomsVersions.map((v) => (
                <li key={v.version} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      berlaku {v.effectiveFrom.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-muted-foreground">· oleh {v.createdBy}</span>
                  </div>
                  <div className="tabular mt-1 text-muted-foreground">{v.rooms.join('  ')}</div>
                  {v.reason ? <div className="mt-1 italic text-muted-foreground">“{v.reason}”</div> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">Riwayat versi syarat pencairan</h3>
          {disbursementConditionsVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada versi.</p>
          ) : (
            <ul className="space-y-2">
              {disbursementConditionsVersions.map((v) => (
                <li key={v.version} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      berlaku {v.effectiveFrom.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-muted-foreground">· oleh {v.createdBy}</span>
                  </div>
                  <div className="tabular mt-1 text-muted-foreground">{v.conditions.join('  ')}</div>
                  {v.reason ? <div className="mt-1 italic text-muted-foreground">“{v.reason}”</div> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">Riwayat versi SLA</h3>
          {slaVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada versi.</p>
          ) : (
            <ul className="space-y-2">
              {slaVersions.map((v) => (
                <li key={v.version} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      berlaku {v.effectiveFrom.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-muted-foreground">· oleh {v.createdBy}</span>
                  </div>
                  <div className="tabular mt-1 text-muted-foreground">
                    {STAGES.map((s) => `T${s}:${v.targets[s] ?? '—'}`).join('  ')}
                  </div>
                  {v.reason ? <div className="mt-1 italic text-muted-foreground">“{v.reason}”</div> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="font-heading text-lg font-semibold">Hari Libur (Kalender SLA)</h3>
            <p className="text-sm text-muted-foreground">
              Hari libur nasional bawaan sudah tersedia secara otomatis. Override berikut bersifat
              aditif (admin menang): tambah tanggal libur operasional bank atau hapus tanggal dari
              kalender bawaan. Format: <span className="font-mono">YYYY-MM-DD</span>, satu per baris
              atau dipisah koma.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tambah tanggal libur</span>
              <textarea
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={holidayAdded}
                onChange={(e) => setHolidayAdded(e.target.value)}
                placeholder={"2025-12-26\n2026-01-02"}
                disabled={isPending}
                aria-label="Tanggal yang ditambahkan ke kalender libur"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Hapus dari kalender bawaan</span>
              <textarea
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={holidayRemoved}
                onChange={(e) => setHolidayRemoved(e.target.value)}
                placeholder="2025-01-27"
                disabled={isPending}
                aria-label="Tanggal yang dihapus dari kalender bawaan"
              />
            </label>
          </div>
          <Input
            value={holidayReason}
            onChange={(e) => setHolidayReason(e.target.value)}
            placeholder="Alasan perubahan (opsional, masuk ke catatan audit)"
            aria-label="Alasan perubahan kalender libur"
            disabled={isPending}
          />
          <Button
            type="button"
            onClick={saveHoliday}
            disabled={isPending || (!holidayAdded.trim() && !holidayRemoved.trim())}
          >
            Simpan versi baru
          </Button>
          <div className="mt-2 border-t pt-4">
            <p className="mb-2 text-sm font-medium">Perbarui dari API hari libur nasional</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={2020}
                max={2100}
                inputMode="numeric"
                className="w-28"
                value={apiYear}
                onChange={(e) => setApiYear(Number(e.target.value))}
                disabled={isPending}
                aria-label="Tahun untuk ambil dari API"
              />
              <Button type="button" variant="outline" onClick={refreshFromApi} disabled={isPending}>
                Perbarui dari API
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">Riwayat versi kalender hari libur</h3>
          {holidayVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada versi override.</p>
          ) : (
            <ul className="space-y-2">
              {holidayVersions.map((v) => (
                <li key={v.version} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      berlaku{' '}
                      {v.effectiveFrom.toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="text-muted-foreground">· oleh {v.createdBy}</span>
                  </div>
                  {v.added.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      <span className="font-medium text-foreground">+{v.added.length}</span>{' '}
                      {v.added.join(', ')}
                    </div>
                  ) : null}
                  {v.removed.length > 0 ? (
                    <div className="mt-1 text-muted-foreground">
                      <span className="font-medium text-foreground">−{v.removed.length}</span>{' '}
                      {v.removed.join(', ')}
                    </div>
                  ) : null}
                  {v.reason ? (
                    <div className="mt-1 italic text-muted-foreground">{`"${v.reason}"`}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ScheduleSection templates={scheduleTemplates} />
    </div>
  )
}

// ── Stage 5 §8: Jadwal Komite (templates + manual materializer trigger) ──────────────────
// Minimal operator interface for slice C-a. Active-template DISPLAY (read-only) + a "Materialize
// 14 hari" button that calls runMeetingMaterializerAction. Full per-template edit form is a
// follow-on; for now ops can populate templates via setMeetingScheduleTemplatesAction (server
// action) and verify here. Daily cron = pg-boss worker process (ops; not deployed in dev).
const DOW_LABEL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function ScheduleSection({ templates }: { templates: MeetingScheduleTemplate[] }) {
  const [isPending, startTransition] = useTransition()
  function runMaterializer() {
    startTransition(async () => {
      try {
        const result = await runMeetingMaterializerAction()
        const created = result.created.length
        const dup = result.skipped.filter((s) => s.reason === 'duplicate').length
        toast.success(`Materialized ${created} rapat (${dup} sudah ada / dilewati).`)
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-lg font-semibold">
            <CalendarClock className="size-4 text-info" aria-hidden /> Jadwal Komite
          </h3>
          <p className="text-sm text-muted-foreground">
            Template berulang (hari + jam) yang dimaterialisasi tiap hari oleh cron menjadi rapat
            <em> proposed</em>. Manusia mengonfirmasi agenda &amp; ketua sebelum rapat diumumkan.
          </p>
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada template aktif. Operator dapat membuat versi pertama via{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">setMeetingScheduleTemplatesAction</code>.
          </p>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.scheduleKey} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t.scheduleKey}</Badge>
                  <span className="font-medium">
                    {DOW_LABEL[t.dayOfWeek]} · {t.time}
                  </span>
                  {t.room && <span className="text-muted-foreground">@ {t.room}</span>}
                  {t.meetingUrl && <span className="text-muted-foreground">+ daring</span>}
                  <span className="text-muted-foreground tabular-nums">
                    · kapasitas {t.capacity}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Ketua: {t.chairUserId} · Attendees: {t.attendeeUserIds.length} orang
                  {t.routingFilter
                    ? ` · routing: plafond ${t.routingFilter.minPlafond ?? '—'}–${t.routingFilter.maxPlafond ?? '—'}${t.routingFilter.akadTypes?.length ? `, akad ${t.routingFilter.akadTypes.join('/')}` : ''}`
                    : ''}
                </div>
                {t.notes && <div className="mt-1 italic text-muted-foreground">“{t.notes}”</div>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button type="button" onClick={runMaterializer} disabled={isPending || templates.length === 0}>
            {isPending ? 'Memuat…' : 'Materialize 14 hari ke depan'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Idempoten — re-run aman; rapat yang sudah ada akan dilewati.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
