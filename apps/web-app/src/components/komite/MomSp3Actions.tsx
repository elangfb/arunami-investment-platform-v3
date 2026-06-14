'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApprovalLadder } from '@/components/application/ApprovalLadder'
import { useActor } from '@/context/ActorProvider'
import { hasAnyDesk } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { generateMomAction, generateSp3Action } from '@/server/actions/mom-sp3'
import type { LoanApplication } from '@/lib/types'

// Committee/RM document generation: MoM (minutes) any time, SP3 (offer letter) once approved/
// conditional. RM-invoked per ai-assist.md §"Document creation triggers". Opens the generated Doc
// (one-way fill, then it belongs to the maker). Gated to mirror the server action's desk check.
//
// SP3 Legal-review chain (N1, docs/designs/rm-led-pipeline-redesign.md §4): once the deal is
// decision-recorded (Komite approve/conditional — the same gate that opens SP3 drafting), the
// single-reviewer SP3 → Legal ladder is rendered here next to the SP3 doc. The RM (sp3-author)
// requests review and the Legal reviewer (sp3-legal-review) approves/sends back. SP3-Legal
// approval is one of the TWO disbursement prerequisites (the other is the all-signed MoM);
// completing it NEVER advances the stage — the gate is enforced at the release step (PencairanTab
// / advanceDisbursementAction). The ladder's request action is itself server-gated on the SP3 doc
// existing (DocLinkage.sp3DocId), mirroring the MUAP gate.
export function MomSp3Actions({ app, onUpdate }: { app: LoanApplication; onUpdate?: (a: LoanApplication) => void }) {
  const actor = useActor()
  const [busy, setBusy] = useState<'mom' | 'sp3' | null>(null)

  const canMom = hasAnyDesk(actor, 'komite', 'intake', 'pencairan')
  const canSp3 = hasAnyDesk(actor, 'intake', 'pencairan')
  const approved = app.komiteDecision === 'approve' || app.komiteDecision === 'conditional'
  // The SP3 Legal-review ladder opens at decision-recorded (approve/conditional) — for everyone, so
  // the Legal reviewer (sp3-legal-review desk) sees the awaited rung and can act. The ladder itself
  // gates each action by desk, mirroring the server.
  const showSp3Ladder = approved
  if (!canMom && !canSp3 && !showSp3Ladder) return null

  async function gen(which: 'mom' | 'sp3') {
    setBusy(which)
    await runAction(
      () => (which === 'mom' ? generateMomAction(app.id) : generateSp3Action(app.id)),
      (res) => window.open(res.url, '_blank', 'noopener,noreferrer'),
    )
    setBusy(null)
  }

  return (
    <div className="space-y-4">
      {(canMom || (canSp3 && approved)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-primary" aria-hidden />
              Dokumen Komite & Penawaran
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {canMom && (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => gen('mom')} className="gap-2">
                <FileText className="size-4" aria-hidden />
                {busy === 'mom' ? 'Membuat…' : 'Buat Notulen (MoM)'}
              </Button>
            )}
            {canSp3 && approved && (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => gen('sp3')} className="gap-2">
                <FileText className="size-4" aria-hidden />
                {busy === 'sp3' ? 'Membuat…' : 'Buat SP3'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* SP3 single-reviewer Legal chain (N1). RM requests review on the generated SP3; the Legal
       *  reviewer approves/sends back. One of the two disbursement prerequisites — does NOT advance
       *  the stage. onUpdate falls back to a server refresh in surfaces (KomiteVoting) that re-read
       *  the aggregate from the page rather than holding it in state. */}
      {showSp3Ladder && (
        <ApprovalLadder app={app} chain="sp3" onUpdate={onUpdate ?? (() => undefined)} />
      )}
    </div>
  )
}
