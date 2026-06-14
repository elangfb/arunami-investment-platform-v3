'use client'

import { useCallback, useState } from 'react'
import { Sparkles, ShieldAlert } from 'lucide-react'
import { DossierSection } from '@/components/application/DossierSection'
import { DocsPanel } from '@/components/application/docs/DocsPanel'
import { DocProvenanceBand } from '@/components/application/DocProvenanceBand'
import { ApprovalLadder } from '@/components/application/ApprovalLadder'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { StatusChip } from '@/components/shared/StatusChip'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { canEditDoc, canViewDoc } from '@/lib/auth/doc-access'
import { runAction } from '@/lib/client-action'
import { statusForView } from '@/lib/proses-steps'
import { buildSeedContext } from '@/lib/seed-context'
import { recommendationLabels } from '@/lib/stage-action'
import { markRskSyncedAction } from '@/server/actions/application-data'
import { saveRiskRecommendationAction } from '@/server/actions/application-stage'
import { askAdvisoryRecommendationAction } from '@/server/actions/ai-rec'
import type { LoanApplication, RiskRecommendation } from '@/lib/types'

// RSK is authored in Google Docs (the source of truth); this tab embeds the read-only
// preview + sync controls (DocsPanel). The Risk Team's RECOMMENDATION (the OJK-veto
// verdict) is recorded HERE now — moved out of the cockpit's "Tugas Anda" so that pane
// stays a short directive while the actual risk decision lives with the risk memo.
export function RSKTab({ app, onUpdate }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void }) {
  const actor = useActor()
  // Edit (maker) gate — shared with the Drive grant so the in-app affordance and Google
  // Docs access can't drift (lib/auth/doc-access). do-it-early: draft RSK from stage 1.
  const canEdit = canEditDoc(actor, app, 'rsk')
  // View gate — shared with the Drive grant so the embed never shows Google's "request access"
  // wall to someone we won't grant (mirrors MUAPTab). Read is universal now, so this is a
  // defense-in-depth net that re-narrows in lockstep if canViewDoc is ever tightened.
  const canView = canViewDoc(actor, 'rsk')
  // The recommendation is a DECISION, strictly at-stage (stage 4) and desk-gated —
  // enforced server-side in saveRiskRecommendationAction; the UI mirrors that gate.
  const canRecommend = hasDesk(actor, 'rsk-author') && app.stage === 4 && !app.komiteDecision

  const [rec, setRec] = useState<Exclude<RiskRecommendation, null>>(app.riskRecommendation ?? 'approve')
  const [note, setNote] = useState(app.riskNote ?? '')
  const needsNote = rec !== 'approve'
  const canSave = !needsNote || note.trim().length > 0

  const handleSynced = useCallback(async (at: string) => {
    if (app.rskSyncedAt) return
    await runAction(() => markRskSyncedAction(app.id, at), onUpdate)
  }, [app.id, app.rskSyncedAt, onUpdate])

  async function saveRecommendation() {
    await runAction(() => saveRiskRecommendationAction(app.id, rec, note), onUpdate)
  }

  const [advisoryLoading, setAdvisoryLoading] = useState(false)
  async function requestAdvisory() {
    setAdvisoryLoading(true)
    try {
      await runAction(() => askAdvisoryRecommendationAction(app.id), onUpdate)
    } finally {
      setAdvisoryLoading(false)
    }
  }

  if (!canView) {
    return (
      <DossierSection
        icon={ShieldAlert}
        title="RSK"
        owners={['RA']}
        status={statusForView(app, 'rsk')}
        note="Risk Summary Komite + rekomendasi Risk Analyst — sumber Google Docs (pratinjau hanya-baca)."
      >
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Dokumen RSK tidak tersedia untuk peran Anda.
        </div>
      </DossierSection>
    )
  }

  return (
    <DossierSection
      icon={ShieldAlert}
      title="RSK"
      owners={['RA']}
      status={statusForView(app, 'rsk')}
      note="Risk Summary Komite + rekomendasi Risk Analyst — sumber Google Docs."
    >
      {/* Provenance band — §15.4 "Disusun AI · diperbarui …". Shared with MUAP. The doc-bearing
       *  tabs lead with provenance → document, then the role's work, then the signature ladder. */}
      <DocProvenanceBand
        syncedAt={app.rskSyncedAt}
        verifiedLabel="Diperbarui dari Tim Risiko"
        pendingLabel="Belum diperbarui — perlu review Tim Risiko"
      />

      <DocsPanel appId={app.id} seed={buildSeedContext(app)} view="rsk" canManage={canEdit} onSynced={handleSynced} />

      <Card>
        <CardHeader><CardTitle className="text-base">Kajian Risiko — Rekomendasi</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {app.riskRecommendation && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Rekomendasi Risk Analyst:</span>
              <DecisionChip decision={app.riskRecommendation} />
            </div>
          )}
          {canRecommend ? (
            <>
              <Select value={rec} onValueChange={(v) => setRec(v as Exclude<RiskRecommendation, null>)}>
                <SelectTrigger className="w-full sm:w-[220px]"><SelectValue>{recommendationLabels[rec]}</SelectValue></SelectTrigger>
                <SelectContent>
                  {(['approve', 'conditional', 'reject'] as const).map((v) => (
                    <SelectItem key={v} value={v}>{recommendationLabels[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan risk review" rows={3} />
              <Button onClick={saveRecommendation} disabled={!canSave}>Simpan Rekomendasi</Button>
              {needsNote && !note.trim() && <p className="text-sm text-muted-foreground">Catatan wajib diisi untuk Conditional / Reject.</p>}
            </>
          ) : app.riskNote ? (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{app.riskNote}</p>
          ) : !app.riskRecommendation ? (
            <p className="text-sm text-muted-foreground">Belum ada rekomendasi risiko.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Saran AI — advisory only (workflow-finetune.md §6). NEVER written to the authoritative
       *  riskRecommendation above; NEVER frozen into the RSK doc. RT must still decide. */}
      {(canRecommend || app.aiRiskAdvisory) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-info" aria-hidden />
              Saran AI
              <StatusChip tone="info" size="sm" dot={false} label="advisory · bukan keputusan" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Hint dari AI berdasarkan DATA aplikasi. Tim Risiko tetap menentukan rekomendasi resmi di atas — saran ini tidak ditulis ke dokumen RSK.
            </p>
            {app.aiRiskAdvisory ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Rekomendasi (saran):</span>
                  <DecisionChip decision={app.aiRiskAdvisory.recommendation} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(app.aiRiskAdvisory.generatedAt).toLocaleString('id-ID')} · {app.aiRiskAdvisory.model}
                  </span>
                </div>
                <p className="rounded-md bg-info-subtle/50 px-3 py-2 text-sm leading-relaxed">
                  {app.aiRiskAdvisory.rationale}
                </p>
                {canRecommend && (
                  <Button type="button" variant="outline" size="sm" onClick={requestAdvisory} disabled={advisoryLoading}>
                    {advisoryLoading ? 'Memuat…' : 'Generate ulang'}
                  </Button>
                )}
              </>
            ) : canRecommend ? (
              <Button type="button" onClick={requestAdvisory} disabled={advisoryLoading} className="gap-2">
                <Sparkles className="size-4" /> {advisoryLoading ? 'Memuat…' : 'Minta Saran AI'}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
      {/* Maker-checker signature ladder (Analis Risiko → Risk Team Leader). Completing it
       *  freezes the RSK and carries the deal into the Komite queue. */}
      <ApprovalLadder app={app} chain="rsk" onUpdate={onUpdate} />
    </DossierSection>
  )
}
