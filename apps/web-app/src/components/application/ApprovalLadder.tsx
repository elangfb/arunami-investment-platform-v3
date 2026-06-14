'use client'

import { useState } from 'react'
import { Check, Clock, PenLine, QrCode, ShieldCheck, Undo2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusChip, type StatusTone } from '@/components/shared/StatusChip'
import { useActor } from '@/context/ActorProvider'
import { runAction } from '@/lib/client-action'
import { cn } from '@/lib/utils'
import {
  chainRoles,
  chainState,
  currentCycleSteps,
  type ApprovalChain,
  type ApprovalRole,
} from '@/lib/approval-chain'
import { approvalRoleForActor, APPROVAL_ROLE_LABEL } from '@/lib/approval-desks'
import {
  approveStepAction,
  rejectStepAction,
  requestApprovalAction,
} from '@/server/actions/approval'
import type { ApprovalStepRecord, LoanApplication } from '@/lib/types'

// The maker-checker signature ladder folded into the MUAP/RSK document block (MUAP §sig,
// RSK §IX). Each rung shows its state + QR once signed; the awaited rung-holder gets
// Setujui/Kembalikan, the maker gets Ajukan. Completing the ladder freezes the doc + advances
// the workflow (server-side). Rules: lib/approval-chain.ts. Gating mirrors the server actions.

const CHAIN_LABEL: Record<ApprovalChain, string> = { muap: 'MUAP', rsk: 'RSK', sp3: 'SP3' }

function fmt(at: Date): string {
  return new Date(at).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface RungView {
  role: ApprovalRole
  tone: StatusTone
  label: string
  icon: typeof Check
  who?: string
  at?: Date
  qrToken?: string | null
  reason?: string | null
}

export function ApprovalLadder({
  app,
  chain,
  onUpdate,
}: {
  app: LoanApplication
  chain: ApprovalChain
  onUpdate: (a: LoanApplication) => void
}) {
  const actor = useActor()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [override, setOverride] = useState('')

  const ledger = app.approvalSteps ?? []
  const cycle = currentCycleSteps(chain, ledger)
  const state = chainState(chain, ledger)
  const roles = chainRoles(chain)
  const requestStep = cycle.find((s) => s.action === 'request')
  const actedByMe = cycle.some((s) => s.userId === actor.userId)

  // Per-rung view, derived purely from the current cycle.
  const rungs: RungView[] = roles.map((role, i) => {
    if (i === 0) {
      return requestStep
        ? { role, tone: 'info', label: 'Diajukan', icon: PenLine, who: requestStep.userName, at: requestStep.createdAt }
        : { role, tone: 'neutral', label: 'Belum diajukan', icon: PenLine }
    }
    const step = cycle.find((s) => s.role === role && s.action !== 'request') as ApprovalStepRecord | undefined
    if (step?.action === 'approve') {
      return { role, tone: 'success', label: 'Disetujui', icon: Check, who: step.userName, at: step.createdAt, qrToken: step.qrToken }
    }
    if (step?.action === 'reject') {
      return { role, tone: 'danger', label: 'Dikembalikan', icon: X, who: step.userName, at: step.createdAt, reason: step.reason }
    }
    if (state.status === 'awaiting' && state.role === role) {
      return { role, tone: 'warning', label: 'Menunggu', icon: Clock }
    }
    return { role, tone: 'neutral', label: 'Belum giliran', icon: Clock }
  })

  // Overall chain status + the actor's available actions (desk gate mirrors the server).
  const overall: { tone: StatusTone; label: string } =
    state.status === 'complete'
      ? { tone: 'success', label: 'Final — lengkap' }
      : state.status === 'rejected'
        ? { tone: 'danger', label: 'Dikembalikan ke pengaju' }
        : state.status === 'awaiting'
          ? { tone: 'warning', label: `Menunggu ${APPROVAL_ROLE_LABEL[state.role]}` }
          : { tone: 'neutral', label: 'Belum diajukan' }

  const canRequest =
    (state.status === 'idle' || state.status === 'rejected') &&
    approvalRoleForActor(chain, 'request', ledger, actor.desks) !== null
  const canDecide =
    state.status === 'awaiting' &&
    !actedByMe &&
    approvalRoleForActor(chain, 'approve', ledger, actor.desks) !== null

  const muapGateViolations = chain === 'muap' ? (app.hardGateViolations ?? []) : []
  const overrideRequired = canRequest && muapGateViolations.length > 0

  async function run(fn: () => Promise<LoanApplication>, after?: () => void) {
    setBusy(true)
    await runAction(fn, (updated) => {
      onUpdate(updated)
      after?.()
    })
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Rantai Persetujuan {CHAIN_LABEL[chain]}
          <StatusChip
            tone={overall.tone}
            label={overall.label}
            icon={state.status === 'complete' ? ShieldCheck : state.status === 'rejected' ? X : Clock}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-2">
          {rungs.map((r, i) => (
            <li
              key={r.role}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <span className="tabular-nums text-xs text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 font-medium">{APPROVAL_ROLE_LABEL[r.role]}</span>
              {r.who && (
                <span className="truncate text-xs text-muted-foreground">
                  {r.who}
                  {r.at ? ` · ${fmt(r.at)}` : ''}
                </span>
              )}
              {r.qrToken && (
                <a
                  href={`/qr/${r.qrToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  <QrCode className="size-3.5" aria-hidden />
                  QR
                </a>
              )}
              <StatusChip tone={r.tone} label={r.label} icon={r.icon} />
            </li>
          ))}
        </ol>

        {/* Send-back reason surfaced inline so the reviewer sees why it bounced. */}
        {state.status === 'rejected' &&
          (() => {
            const rej = cycle.find((s) => s.action === 'reject') as ApprovalStepRecord | undefined
            return rej?.reason ? (
              <p className="rounded-lg border border-danger/20 bg-danger-subtle/50 px-3 py-2 text-sm text-danger-foreground">
                <span className="font-medium">Alasan dikembalikan:</span> {rej.reason}
              </p>
            ) : null
          })()}

        {/* Maker: open / re-open the ladder. */}
        {canRequest && (
          <div className="space-y-2">
            {overrideRequired && (
              <div className="space-y-2 rounded-lg border border-warning/20 bg-warning-subtle/50 p-3 text-sm text-warning-foreground">
                <p>
                  Hard-gate terlampaui ({muapGateViolations.join(', ').toUpperCase()}). Pengajuan tetap
                  bisa dilakukan dengan alasan override yang tercatat (self-service).
                </p>
                <textarea
                  value={override}
                  onChange={(e) => setOverride(e.target.value)}
                  rows={2}
                  placeholder="Alasan override hard-gate…"
                  className="w-full rounded-lg border bg-input px-3 py-2 text-foreground outline-none ring-ring focus:ring-2"
                />
              </div>
            )}
            <Button
              type="button"
              disabled={busy || (overrideRequired && !override.trim())}
              onClick={() => run(() => requestApprovalAction(app.id, chain, override.trim() || undefined), () => setOverride(''))}
              className="gap-2"
            >
              <PenLine className="size-4" aria-hidden />
              {state.status === 'rejected' ? 'Ajukan Ulang' : 'Ajukan Persetujuan'}
            </Button>
          </div>
        )}

        {/* Awaited checker: approve or send back (reason mandatory on send-back). */}
        {canDecide && !rejecting && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => run(() => approveStepAction(app.id, chain))} className="gap-2">
              <Check className="size-4" aria-hidden />
              Setujui
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting(true)} className="gap-2">
              <Undo2 className="size-4" aria-hidden />
              Kembalikan ke Pengaju
            </Button>
          </div>
        )}
        {canDecide && rejecting && (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Alasan pengembalian (wajib)…"
              className="w-full rounded-lg border bg-input px-3 py-2 text-sm text-foreground outline-none ring-ring focus:ring-2"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={busy || !reason.trim()}
                onClick={() => run(() => rejectStepAction(app.id, chain, reason), () => { setReason(''); setRejecting(false) })}
                className="gap-2"
              >
                <Undo2 className="size-4" aria-hidden />
                Kirim Pengembalian
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => { setRejecting(false); setReason('') }}>
                Batal
              </Button>
            </div>
          </div>
        )}

        {actedByMe && state.status === 'awaiting' && (
          <p className="text-xs text-muted-foreground">
            Anda sudah bertindak pada rantai ini — persetujuan berikutnya menunggu penyetuju lain (empat mata).
          </p>
        )}
      </CardContent>
    </Card>
  )
}
