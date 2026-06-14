'use client'

import { toast } from 'sonner'
import { ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, FileSignature, Wallet, XCircle, AlertTriangle, Circle, Ban, ThumbsUp, ThumbsDown, ShieldCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusChip } from '@/components/shared/StatusChip'
import { DossierSection } from '@/components/application/DossierSection'
import { ApprovalLadder } from '@/components/application/ApprovalLadder'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { advanceDisbursementAction, closeRejectedApplicationAction, recordConditionalResponseAction, toggleDisbursementConditionAction } from '@/server/actions/application-data'
import { disbursementOpen, sp3FinalReady } from '@/lib/stage-action'
import { isChainComplete } from '@/lib/approval-chain'
import { DEFAULT_DISBURSEMENT_CONDITIONS } from '@/lib/config/disbursement-conditions'
import { cn } from '@/lib/utils'
import type { CloseReason, DisbursementStatus, LoanApplication } from '@/lib/types'

const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  'committee-reject': 'Ditolak komite',
  'nasabah-decline': 'Nasabah menolak syarat bersyarat',
  'withdrawn': 'Ditarik (pra-pencairan)',
}

type Props = { app: LoanApplication; onUpdate: (a: LoanApplication) => void }

const STEPS: { id: DisbursementStatus; label: string; icon: typeof ClipboardCheck; hint: string }[] = [
  { id: 'Verifikasi Final', label: 'Verifikasi Final', icon: ClipboardCheck, hint: 'Cek kelengkapan akhir' },
  { id: 'Proses Akad', label: 'Proses Akad', icon: FileSignature, hint: 'Penandatanganan akad' },
  { id: 'Siap Cair', label: 'Siap Cair', icon: Wallet, hint: 'Menunggu rilis dana' },
  { id: 'Cair', label: 'Cair', icon: BadgeCheck, hint: 'Dana ditransfer' },
]
const statuses: DisbursementStatus[] = STEPS.map((s) => s.id)

export function PencairanTab({ app, onUpdate }: Props) {
  const actor = useActor()
  // Disbursement is the RM's job: the pencairan desk advances the approved-path; either RM desk
  // (intake ∪ pencairan) may toggle release conditions (the conditional follow-up runs back at
  // Stage 1). See ADR 0002 §4.
  const isAo = hasDesk(actor, 'intake') || hasDesk(actor, 'pencairan')
  const status: DisbursementStatus = app.disbursementStatus ?? 'Verifikasi Final'
  const done = app.disbursementConditions ?? {}
  const conditions = app.releaseConditions ?? DEFAULT_DISBURSEMENT_CONDITIONS
  const decided = Boolean(app.komiteDecision)
  const closed = app.applicationStatus === 'closed'
  const rejected = app.komiteDecision === 'reject'
  const conditional = app.komiteDecision === 'conditional'
  // Conditional approval still awaiting the nasabah's response (the AO follow-up decision).
  const awaitingNasabah = conditional && !app.conditionalResponse
  // The disbursement pipeline opens for a straight approval OR a conditional approval the
  // nasabah accepted (shared predicate — same gate the server actions enforce).
  const canUpdate = hasDesk(actor, 'pencairan') && disbursementOpen(app)
  const statusIndex = statuses.indexOf(status)
  const nextStatus = statuses[statusIndex + 1]
  const doneCount = conditions.filter((c) => done[c]).length
  const allConditionsDone = doneCount === conditions.length
  // SP3 Legal-review prerequisite (N1, docs/designs/rm-led-pipeline-redesign.md §4): the release
  // toward 'Cair' is the dual-prerequisite gate — disburse-open (MoM done, implied here) AND the
  // SP3 single-reviewer Legal chain complete. Derive the sp3 ledger from the app aggregate's
  // approvalSteps (it carries every chain). The server (advanceDisbursementAction) enforces the
  // same gate; this UI mirrors it (defence in depth).
  const sp3Steps = (app.approvalSteps ?? []).filter((s) => s.chain === 'sp3')
  const sp3Approved = isChainComplete('sp3', sp3Steps)
  const sp3Ready = sp3FinalReady(app, sp3Steps)
  const blockedBySp3 = nextStatus === 'Cair' && !sp3Ready
  const blockedByConditions = nextStatus === 'Cair' && !allConditionsDone
  const canAdvance = canUpdate && Boolean(nextStatus) && !blockedByConditions && !blockedBySp3

  const isCair = status === 'Cair'
  const displayDoneCount = isCair ? conditions.length : doneCount
  const displayAllConditionsDone = isCair || allConditionsDone

  async function advanceStatus() {
    if (!nextStatus || !canAdvance) return
    await runAction(() => advanceDisbursementAction(app.id), (fresh) => {
      onUpdate(fresh)
      toast(nextStatus === 'Cair' ? 'Dana dicairkan — fasilitas masuk portofolio.' : 'Status pencairan diperbarui.')
    })
  }

  async function toggleCondition(item: string, checked: boolean) {
    await runAction(() => toggleDisbursementConditionAction(app.id, item, checked), onUpdate)
  }

  // Conditional-decision follow-up: AO records whether the nasabah accepts the committee's
  // conditions. Accept → proceeds into the disbursement pipeline; decline → closes the app.
  async function recordResponse(accepted: boolean) {
    await runAction(() => recordConditionalResponseAction(app.id, accepted), (fresh) => {
      onUpdate(fresh)
      toast(accepted ? 'Nasabah menyetujui syarat — lanjut ke pencairan.' : 'Pengajuan ditutup — nasabah menolak syarat.')
    })
  }

  async function closeRejected() {
    await runAction(() => closeRejectedApplicationAction(app.id), (fresh) => {
      onUpdate(fresh)
      toast('Pengajuan ditutup.')
    })
  }

  if (!decided) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Wallet className="size-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Pencairan tersedia setelah keputusan komite.</p>
        </CardContent>
      </Card>
    )
  }

  // Terminal: the application was closed without disbursement (committee reject notified,
  // or the nasabah declined a conditional approval). No further action.
  if (closed) {
    const reason = app.closeReason ? CLOSE_REASON_LABEL[app.closeReason] : 'Pengajuan ditutup'
    const closedOn = app.closedAt ? new Date(app.closedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : null
    return (
      <FollowUpCard
        tone="closed"
        icon={Ban}
        title="Pengajuan Ditutup"
        body={`Pengajuan berakhir tanpa pencairan — ${reason.toLowerCase()}.${closedOn ? ` Ditutup ${closedOn}.` : ''}`}
        note={app.komiteDecisionNote}
      >
        <StatusChip tone="neutral" label="Status: Ditutup" icon={Ban} />
      </FollowUpCard>
    )
  }

  if (rejected) {
    return (
      <FollowUpCard
        tone="reject"
        icon={XCircle}
        title="Ditolak Komite — Tindak Lanjut ke Nasabah"
        body="Aplikasi ditolak komite dan dikembalikan ke AO. Komunikasikan keputusan ke nasabah, lalu tutup pengajuan untuk mengakhiri prosesnya."
        note={app.komiteDecisionNote}
      >
        <Button variant="destructive" disabled={!isAo} onClick={closeRejected} className="gap-2">
          <Ban className="size-4" /> Catat Nasabah Dinotifikasi & Tutup Pengajuan
        </Button>
      </FollowUpCard>
    )
  }

  // Conditional approval awaiting the nasabah's response: AO records accept (→ pencairan)
  // or decline (→ pengajuan ditutup). Once accepted, this falls through to the disbursement
  // pipeline below (disbursementOpen is true).
  if (awaitingNasabah) {
    return (
      <FollowUpCard
        tone="conditional"
        icon={AlertTriangle}
        title="Keputusan Bersyarat — Respons Nasabah"
        body="Komite menyetujui dengan syarat. Komunikasikan syarat ke nasabah, lalu catat keputusannya: setuju melanjutkan (lanjut ke pencairan, syarat menjadi syarat pencairan) atau menolak (pengajuan ditutup)."
        note={app.komiteDecisionNote}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button disabled={!isAo} onClick={() => recordResponse(true)} className="gap-2">
            <ThumbsUp className="size-4" /> Nasabah Setuju — Lanjutkan Pencairan
          </Button>
          <Button variant="outline" disabled={!isAo} onClick={() => recordResponse(false)} className="gap-2">
            <ThumbsDown className="size-4" /> Nasabah Tidak Setuju — Tutup Pengajuan
          </Button>
        </div>
        {!isAo && <p className="text-sm text-muted-foreground">Read-only · respons nasabah dicatat oleh AO.</p>}
      </FollowUpCard>
    )
  }

  return (
    <DossierSection
      icon={Wallet}
      title="Pencairan"
      owners={['RM']}
      note="Pencairan dana setelah keputusan komite disetujui."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {/* SP3 Legal-review prerequisite chip — shape-coded (ShieldCheck=approved · Clock=pending),
           *  never colour alone. Surfaces the second disbursement prerequisite alongside the stepper. */}
          <StatusChip
            tone={sp3Approved ? 'success' : 'warning'}
            label={sp3Approved ? 'SP3: Disetujui Legal' : 'SP3: Menunggu Legal'}
            icon={sp3Approved ? ShieldCheck : Clock}
          />
          <StatusChip tone={isCair ? 'success' : 'info'} label={status} icon={isCair ? BadgeCheck : undefined} />
        </div>
      }
    >
      {/* Stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alur Pencairan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative">
            {/* progress rail */}
            <div className="absolute left-0 right-0 top-5 mx-[12.5%] h-0.5 bg-border" aria-hidden />
            <div
              className="absolute left-0 top-5 mx-[12.5%] h-0.5 bg-success transition-[width] duration-500"
              style={{ width: `${(Math.max(0, statusIndex) / (STEPS.length - 1)) * 75}%` }}
              aria-hidden
            />
            <ol className="relative grid grid-cols-4 gap-2">
              {STEPS.map((step, index) => {
                const active = index === statusIndex
                const completed = index < statusIndex
                const Icon = completed ? CheckCircle2 : step.icon
                return (
                  <li key={step.id} className="flex flex-col items-center gap-2 text-center">
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-full ring-4 ring-background transition-colors',
                        completed && 'bg-success text-white',
                        active && 'bg-primary text-white',
                        !active && !completed && 'bg-muted text-muted-foreground ring-border'
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className={cn('text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>{step.label}</span>
                    {/* Secondary hint — hidden below sm so the 4-column stepper stays uncramped on mobile. */}
                    <span className="hidden text-[11px] leading-tight text-muted-foreground/70 sm:block">{step.hint}</span>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button onClick={advanceStatus} disabled={!canAdvance} className="gap-2">
              {nextStatus ? <>Majukan ke {nextStatus} <ArrowRight className="size-4" /></> : <>Pencairan Selesai <CheckCircle2 className="size-4" /></>}
            </Button>
            {blockedBySp3 && (
              <p className="flex items-center gap-1.5 text-sm text-warning-foreground"><Clock className="size-4" /> Menunggu persetujuan Legal atas SP3 sebelum dana dapat dicairkan.</p>
            )}
            {blockedByConditions && (
              <p className="flex items-center gap-1.5 text-sm text-warning-foreground"><AlertTriangle className="size-4" /> Lengkapi seluruh syarat sebelum dana dapat dicairkan.</p>
            )}
            {!canUpdate && !isCair && <p className="text-sm text-muted-foreground">Read-only · pencairan diproses oleh AO.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Condition checklist */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Syarat Pencairan</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Wajib lengkap sebelum status maju ke Cair.</p>
          </div>
          <StatusChip
            tone={displayAllConditionsDone ? 'success' : 'warning'}
            label={`${displayDoneCount}/${conditions.length} syarat`}
            icon={displayAllConditionsDone ? CheckCircle2 : AlertTriangle}
            className="shrink-0 tabular-nums"
          />
        </CardHeader>
        <CardContent>
          <ConditionList conditions={conditions} done={done} canUpdate={canUpdate} onToggle={toggleCondition} forceCompleted={isCair} />
        </CardContent>
      </Card>

      {/* SP3 single-reviewer Legal chain (N1) — the second disbursement prerequisite, surfaced on the
       *  same tab as the gate it controls. The RM requests review; the Legal reviewer approves/sends
       *  back. The reviewer's pending rung also pushes a notification (?view=pencairan). Completing it
       *  never advances the stage; it unblocks the release toward 'Cair' above. */}
      <ApprovalLadder app={app} chain="sp3" onUpdate={onUpdate} />
    </DossierSection>
  )
}

function ConditionList({ conditions, done, canUpdate, onToggle, forceCompleted = false }: { conditions: string[]; done: Record<string, boolean>; canUpdate: boolean; onToggle: (item: string, checked: boolean) => void; forceCompleted?: boolean }) {
  return (
    <div className="space-y-2">
      {conditions.map((item) => {
        const checked = forceCompleted || !!done[item]
        return (
          <label
            key={item}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors',
              checked ? 'border-success/20 bg-success-subtle/60' : 'hover:bg-muted/40',
              !canUpdate && 'cursor-default opacity-90'
            )}
          >
            <input type="checkbox" className="peer sr-only" checked={checked} disabled={!canUpdate} onChange={(e) => onToggle(item, e.target.checked)} />
            {checked ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <Circle className="size-5 shrink-0 text-muted-foreground" />}
            <span className={cn(checked && 'text-success-foreground')}>{item}</span>
          </label>
        )
      })}
    </div>
  )
}

function FollowUpCard({ tone, icon: Icon, title, body, note, children }: { tone: 'reject' | 'conditional' | 'closed'; icon: typeof XCircle; title: string; body: string; note?: string; children: React.ReactNode }) {
  const accent = tone === 'reject'
    ? { ring: 'ring-danger/15', bar: 'bg-danger', iconBg: 'bg-danger-subtle text-danger-foreground', noteBox: 'border-danger bg-danger-subtle text-danger-foreground' }
    : tone === 'closed'
    ? { ring: 'ring-neutral-token/15', bar: 'bg-neutral-token', iconBg: 'bg-neutral-token-subtle text-neutral-token-foreground', noteBox: 'border-neutral-token bg-neutral-token-subtle text-neutral-token-foreground' }
    : { ring: 'ring-warning/15', bar: 'bg-warning', iconBg: 'bg-warning-subtle text-warning-foreground', noteBox: 'border-warning bg-warning-subtle text-warning-foreground' }
  return (
    <Card className={cn('overflow-hidden ring-1 ring-inset', accent.ring)}>
      <div className={cn('h-1 w-full', accent.bar)} />
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', accent.iconBg)}><Icon className="size-5" /></span>
          <div className="space-y-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
        {note && <blockquote className={cn('rounded-md border-l-4 px-3 py-2 text-sm', accent.noteBox)}>{note}</blockquote>}
        {children}
      </CardContent>
    </Card>
  )
}
