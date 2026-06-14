'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Video, ExternalLink, CheckCircle2, QrCode, PenLine, Upload, FileText } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Page } from '@/components/layout/Page'
import { DECISION_ICON, DecisionChip, DecisionResult } from '@/components/komite/DecisionResult'
import { MomSp3Actions } from '@/components/komite/MomSp3Actions'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { formatRupiah } from '@/lib/sla-utils'
import { akadConfig } from '@/lib/akad-config'
import { setKomiteOutcomeAction, signMomAction } from '@/server/actions/komite'
import { uploadKomiteDeckAction } from '@/server/actions/application-data'
import { runAction } from '@/lib/client-action'
import { committeeOf, formatMeetingDate, meetingVenueLabel, voteLabels, MIN_KOMITE_QUORUM } from '@/lib/komite'
import type { KomiteMeeting, KomiteVoteValue, LoanApplication } from '@/lib/types'
import { getUserById } from '@/lib/seed-data'
import { roleSopLabel } from '@/lib/role-labels'
import { cn } from '@/lib/utils'

// Rapat Komite room (ADR-0005): no in-app voting. The Ketua records the per-app outcome; every
// attending Komite member then QR-signs the MoM (unordered attestation). When the last required
// signer signs, the recorded decision applies and the app routes — all server-enforced
// (setKomiteOutcomeAction / signMomAction). This surface drives those two actions + shows progress.
export function KomiteVoting({ app, meeting }: { app: LoanApplication; meeting: KomiteMeeting | null }) {
  const actor = useActor()
  const router = useRouter()
  const isFlatAkad = akadConfig(app.akadType).usesMargin
  const [decision, setDecision] = useState<KomiteVoteValue | undefined>(app.komiteDecision)
  const [decisionNote, setDecisionNote] = useState(app.komiteDecisionNote ?? '')
  const [approvedPlafond, setApprovedPlafond] = useState(String(app.requestedPlafond))
  const [approvedTenor, setApprovedTenor] = useState(String(app.requestedTenorMonths))
  const [approvedMargin, setApprovedMargin] = useState(app.marginRate != null ? String(app.marginRate) : '')
  const [busy, setBusy] = useState(false)

  // MoM signatures live in the shared ApprovalStep ledger under chain='mom'.
  const momSigs = (app.approvalSteps ?? []).filter((s) => s.chain === 'mom')
  const signedIds = new Set(momSigs.map((s) => s.userId))

  // Decided + ROUTED — the outcome applied and the app left the committee stage. Final, audit view.
  if (app.komiteDecision && app.stage !== 5) {
    return (
      <Page.Root>
        <Page.Header eyebrow="Rapat Komite" title={`Ruang Komite — ${app.id}`} description={app.nasabahName} />
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside><MuapSummary app={app} /></aside>
          <main className="space-y-4">
            <DecisionResult app={app} />
            {momSigs.length > 0 && <SignatureRollCall sigs={momSigs} />}
            <KomiteDeck app={app} />
            <MomSp3Actions app={app} onUpdate={() => router.refresh()} />
          </main>
        </div>
      </Page.Root>
    )
  }

  // OJK veto: a Risk-rejected application never reaches the committee floor.
  if (app.riskRecommendation === 'reject') {
    return (
      <Page.Root>
        <Page.Header eyebrow="Rapat Komite" title={`Ruang Komite — ${app.id}`} description={app.nasabahName} />
        <Card className="border-danger/30 bg-danger-subtle">
          <CardHeader><CardTitle className="text-danger-foreground">Tidak Perlu Sidang Komite</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-danger-foreground">
            <p>Risk Analyst telah memveto aplikasi ini dengan rekomendasi <strong>Reject</strong>.</p>
            <p>Sesuai regulasi OJK, Komite tidak dapat menganulir veto Risk Analyst. Aplikasi telah dikembalikan ke Relationship Manager untuk komunikasi ke nasabah.</p>
            {app.riskNote && <blockquote className="border-l-4 border-danger/40 pl-3 italic">{app.riskNote}</blockquote>}
          </CardContent>
        </Card>
      </Page.Root>
    )
  }

  // Composition (attendees + chair) comes from the meeting whose agenda includes this app. An app
  // can't START a decision without a scheduled meeting — but one already decided (outcome recorded)
  // still shows its outcome + documents even if no current meeting references it.
  const committee = meeting ? committeeOf(meeting) : undefined
  const outcomeSet = !!app.komiteDecision
  if (!outcomeSet && (!meeting || !committee)) {
    return (
      <Page.Root>
        <Page.Header eyebrow="Rapat Komite" title={`Ruang Komite — ${app.id}`} description={app.nasabahName} />
        <Card className="border-border bg-muted/40">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><CalendarClock className="size-5" /></span>
              <CardTitle>Belum Dijadwalkan ke Rapat Komite</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Aplikasi ini belum masuk agenda sidang komite mana pun, sehingga susunan komite (anggota & ketua) belum ditentukan.</p>
            <p>Jadwalkan aplikasi ini lewat menu <strong>Rapat Komite</strong> terlebih dahulu untuk membuka rapat.</p>
          </CardContent>
        </Card>
      </Page.Root>
    )
  }

  const chair = committee?.chair
  const isKetua = !!chair && actor.userId === chair.id
  // All attendees = the full meeting roster (Komite + added involved-team participants). committeeOf
  // filters to Komite only, so resolve the full list from the meeting for the signing panel.
  const allAttendees = (meeting?.attendeeUserIds ?? []).flatMap((id) => { const u = getUserById(id); return u ? [u] : [] })
  // Required (BLOCKING) signers = the attending KOMITE; added participants attest (non-blocking).
  const requiredSigners = allAttendees.filter((a) => a.role === 'CM')
  const signedRequired = requiredSigners.filter((r) => signedIds.has(r.id)).length
  const allSigned = requiredSigners.length >= MIN_KOMITE_QUORUM && signedRequired === requiredSigners.length
  // The Ketua may set/adjust the outcome until the FIRST signature lands (freeze-on-first-sig).
  const chairCanSet = isKetua && !!committee && momSigs.length === 0
  const canSaveOutcome = chairCanSet && !!decision && (decision === 'approve' || decisionNote.trim().length > 0)

  async function saveOutcome() {
    if (!decision) return
    setBusy(true)
    try {
      await setKomiteOutcomeAction(app.id, {
        decision,
        decisionNote,
        approvedPlafond: Number(approvedPlafond),
        approvedTenorMonths: Number(approvedTenor),
        approvedMarginRate: isFlatAkad ? Number(approvedMargin) : null,
      })
      toast('Keputusan Komite dicatat — menunggu tanda tangan MoM')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message || 'Gagal menyimpan keputusan komite.')
    } finally {
      setBusy(false)
    }
  }

  async function signMom() {
    setBusy(true)
    try {
      // The decision archive (freeze MUAP+RSK PDFs + SHA) now happens SERVER-SIDE inside
      // signMomAction (Batch 3 T6) — part of the decision flow, with hard failure recording — so the
      // client no longer fire-and-forgets it (the old `.catch(console.warn)` could lose the archive).
      await signMomAction(app.id)
      toast('Tanda tangan MoM Anda telah direkam')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message || 'Gagal menandatangani MoM.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page.Root>
      <Page.Header eyebrow="Rapat Komite" title={`Ruang Komite — ${app.id}`} description={app.nasabahName} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <MuapSummary app={app} />
          {meeting && chair && (
            <Card>
              <CardHeader><CardTitle>Sidang Komite</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Info label="Rapat" value={`${meeting.id} · ${meetingVenueLabel(meeting)}`} />
                <Info label="Jadwal" value={`${formatMeetingDate(meeting.date)} ${meeting.time}`} />
                <Info label="Ketua Rapat" value={chair.name} />
                {meeting.meetingUrl && meeting.status === 'upcoming' && (
                  <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                    <Video className="size-3.5" /> Gabung Rapat <ExternalLink className="size-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          )}
        </aside>

        <main className="space-y-4">
          {/* Step 1 — the Ketua records the outcome (no routing until the MoM is signed). */}
          <Card>
            <CardHeader><CardTitle>Keputusan Komite</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {outcomeSet && (
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Keputusan dicatat — <DecisionChip decision={app.komiteDecision!} />
                  {!allSigned && committee && <span className="text-muted-foreground">· menunggu tanda tangan MoM</span>}
                </p>
              )}
              {chairCanSet ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {(['approve', 'conditional', 'reject'] as const).map((v) => {
                      const Icon = DECISION_ICON[v]
                      return (
                        <Button key={v} variant="outline" onClick={() => setDecision(v)} className={cn(decision === v && 'bg-accent ring-2 ring-primary')}>
                          <Icon className="size-4" /> {voteLabels[v]}
                        </Button>
                      )
                    })}
                  </div>
                  {decision === 'approve' && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <p className="text-sm text-muted-foreground">Pra-isi dari nilai yang diajukan; sesuaikan bila perlu.</p>
                      <label className="space-y-2 text-sm font-medium">Plafond Disetujui (Rp)
                        <Input type="number" value={approvedPlafond} onChange={(e) => setApprovedPlafond(e.target.value)} />
                      </label>
                      <label className="space-y-2 text-sm font-medium">Tenor Disetujui (bulan)
                        <Input type="number" value={approvedTenor} onChange={(e) => setApprovedTenor(e.target.value)} />
                      </label>
                      {isFlatAkad && (
                        <label className="space-y-2 text-sm font-medium">Margin Disetujui (%)
                          <Input type="number" value={approvedMargin} onChange={(e) => setApprovedMargin(e.target.value)} />
                        </label>
                      )}
                    </div>
                  )}
                  <Textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder={decision === 'approve' ? 'Catatan opsional' : 'Wajib diisi untuk keputusan Bersyarat / Ditolak'} />
                  {decision && decision !== 'approve' && !decisionNote.trim() && (
                    <p className="text-sm text-danger-foreground">Catatan wajib diisi untuk keputusan {voteLabels[decision]}.</p>
                  )}
                  <Button onClick={saveOutcome} disabled={!canSaveOutcome || busy}>{outcomeSet ? 'Perbarui Keputusan' : 'Catat Keputusan'}</Button>
                </div>
              ) : !outcomeSet ? (
                <p className="text-sm text-muted-foreground">Keputusan dicatat oleh Ketua Rapat. Menunggu Ketua menetapkan hasil sidang.</p>
              ) : (
                app.komiteDecisionNote && <p className="rounded-md bg-muted p-3 text-sm">{app.komiteDecisionNote}</p>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — every attending Komite member QR-signs the MoM. Routing fires on the last signature. */}
          {outcomeSet && committee && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                  <span>Tanda Tangan MoM</span>
                  <span className="text-sm font-normal text-muted-foreground">{signedRequired}/{requiredSigners.length} Komite menandatangani</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {requiredSigners.length < MIN_KOMITE_QUORUM && (
                  <p className="rounded-md border border-warning/40 bg-warning-subtle p-3 text-sm text-warning-foreground">Kuorum belum terpenuhi — minimal {MIN_KOMITE_QUORUM} anggota Komite harus hadir & menandatangani.</p>
                )}
                {allAttendees.map((member) => {
                  const sig = momSigs.find((s) => s.userId === member.id)
                  const isCurrent = actor.userId === member.id
                  const canSignNow = isCurrent && !sig // any attendee may sign (Komite blocking, others attest)
                  return (
                    <div key={member.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <Avatar><AvatarFallback>{initials(member.name)}</AvatarFallback></Avatar>
                        <div className="flex-1">
                          <p className="font-semibold">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.role === 'CM' ? (member.id === chair?.id ? 'Ketua Rapat · wajib TTD' : 'Anggota Komite · wajib TTD') : `${roleSopLabel(member.role)} · atestasi`}</p>
                        </div>
                        {sig
                          ? <span className="flex items-center gap-1.5 text-sm font-medium text-success-foreground"><CheckCircle2 className="size-4" /> Ditandatangani</span>
                          : <span className="text-sm text-muted-foreground">Menunggu</span>}
                      </div>
                      {sig?.qrToken && (
                        <a href={`/qr/${sig.qrToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                          <QrCode className="size-3.5" /> Verifikasi QR <ExternalLink className="size-3" />
                        </a>
                      )}
                      {canSignNow && <Button size="sm" onClick={signMom} disabled={busy}><PenLine className="size-4" /> Tanda Tangan MoM</Button>}
                    </div>
                  )
                })}
                {allSigned && <p className="text-sm text-muted-foreground">Semua Komite telah menandatangani — keputusan diterapkan.</p>}
              </CardContent>
            </Card>
          )}

          {/* Konten/Deck Komite (#12) — committee material drafted outside Mizan, uploaded per app. */}
          <KomiteDeck app={app} />
          {/* MoM/SP3 document generation (available once the outcome is recorded). */}
          {outcomeSet && <MomSp3Actions app={app} onUpdate={() => router.refresh()} />}
        </main>
      </div>
    </Page.Root>
  )
}

// Left-aside MUAP snapshot, shared by the decided + active layouts.
function MuapSummary({ app }: { app: LoanApplication }) {
  return (
    <Card>
      <CardHeader><CardTitle>Ringkasan MUAP</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Info label="App ID" value={app.id} />
        <Info label="Nasabah" value={app.nasabahName} />
        <Info label="Akad" value={app.akadType} />
        <Info label="Plafond" value={formatRupiah(app.requestedPlafond)} />
        <div className="grid grid-cols-3 gap-2 pt-2">
          <Stat label="DSR" value={`${app.hardGates.dsr}%`} />
          <Stat label="LTV" value={`${app.hardGates.ltv}%`} />
          <Stat label="Kol" value={String(app.hardGates.kol)} />
        </div>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="mb-1.5 text-xs text-muted-foreground">Risk Recommendation</p>
          {app.riskRecommendation ? <DecisionChip decision={app.riskRecommendation} /> : <span className="text-sm text-muted-foreground">Belum ada</span>}
        </div>
      </CardContent>
    </Card>
  )
}

// Read-only roll-call of MoM signatures — the audit view for a decided application.
function SignatureRollCall({ sigs }: { sigs: { userId: string; userName: string; qrToken: string | null }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Tanda Tangan MoM Komite</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {sigs.map((s) => (
          <div key={s.userId} className="flex items-center gap-3">
            <Avatar><AvatarFallback>{initials(s.userName)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><p className="font-medium">{s.userName}</p></div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-success-foreground"><CheckCircle2 className="size-4" /> Sah</span>
            {s.qrToken && (
              <a href={`/qr/${s.qrToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                <QrCode className="size-3.5" /> QR
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div> }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-2 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div> }
function initials(name: string) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2) }

// Konten/Deck Komite (#12): per-app committee material, drafted outside Mizan and uploaded into the
// Rapat. Reuses the supporting-doc storage via uploadKomiteDeckAction (docType 'konten-komite').
function KomiteDeck({ app }: { app: LoanApplication }) {
  const actor = useActor()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const decks = app.documents.filter((d) => d.docType === 'konten-komite')
  const canUpload = hasDesk(actor, 'komite')
  async function upload(file: File) {
    const fd = new FormData()
    fd.set('file', file)
    await runAction(() => uploadKomiteDeckAction(app.id, fd), () => router.refresh())
  }
  return (
    <Card>
      <CardHeader><CardTitle>Konten / Deck Komite</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {decks.length === 0 && <p className="text-sm text-muted-foreground">Belum ada konten/deck diunggah. Deck disusun di luar Mizan lalu diunggah ke sini.</p>}
        {decks.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <FileText className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate font-medium">{d.name}</span>
          </div>
        ))}
        {canUpload && (
          <>
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = '' }} />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Upload className="size-4" /> Unggah Konten/Deck</Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
