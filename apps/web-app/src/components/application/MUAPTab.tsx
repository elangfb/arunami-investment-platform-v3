'use client'

import { useCallback, useState } from 'react'
import { FileText, Globe2, ExternalLink, Info } from 'lucide-react'
import { toast } from 'sonner'
import { DossierSection } from '@/components/application/DossierSection'
import { DocsPanel } from '@/components/application/docs/DocsPanel'
import { DocProvenanceBand } from '@/components/application/DocProvenanceBand'
import { ApprovalLadder } from '@/components/application/ApprovalLadder'
import { DecisionChip } from '@/components/komite/DecisionResult'
import { StatusChip } from '@/components/shared/StatusChip'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useActor } from '@/context/ActorProvider'
import { canEditDoc, canViewDoc } from '@/lib/auth/doc-access'
import { hasDesk } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { statusForView } from '@/lib/proses-steps'
import { formatRupiah } from '@/lib/sla-utils'
import { buildSeedContext } from '@/lib/seed-context'
import { markMuapSyncedAction } from '@/server/actions/application-data'
import { generateMuapAction } from '@/server/actions/docs-muap'
import { runWebResearchAction } from '@/server/actions/research'
import { phaseOf, type LoanApplication } from '@/lib/types'

// MUAP is authored in Google Docs (the source of truth); this tab embeds the
// read-only preview + sync controls (DocsPanel). The legacy in-app composed
// "MEMORANDUM USULAN ANALISA PEMBIAYAAN" + per-app TemplateDoc editor were removed
// once Docs-as-source landed. A successful sync mirrors muapSyncedAt onto the app
// so the pipeline can read "MUAP done" synchronously.
export function MUAPTab({ app, onUpdate }: { app: LoanApplication; onUpdate: (a: LoanApplication) => void }) {
  const actor = useActor()
  // MUAP edit (maker) + view (author/downstream/checkers) gates — shared with the Drive
  // grant so the in-app affordance and Google Docs access can't drift (lib/auth/doc-access).
  const canEdit = canEditDoc(actor, app, 'muap') // do-it-early: draft MUAP from stage 1
  const canView = canViewDoc(actor, 'muap')
  // N2 (ADR-0018): the explicit "Generate MUAP" is available across the whole Inisiasi phase (MUAP-early),
  // not only at the canEditDoc exact stage — the muap-author works phase-wide. The server action
  // (generateMuapAction) re-enforces this gate; this only governs the affordance.
  const canGenerateMuap = hasDesk(actor, 'muap-author') && phaseOf(app.stage) === 1
  // Web research is LA's tool — same gate as MUAP editing. Refused by the egress
  // classifier for individual nasabah / missing business name (server-side; UI mirrors).
  const canResearch = canEdit
  const researchEligible = app.nasabahType === 'business' && !!app.namaUsaha?.trim()
  const [researchLoading, setResearchLoading] = useState(false)
  const sources = app.exploredSources ?? []
  // Three states, persisted via the column: null/undefined = never run; [] = ran but no
  // authoritative source passed the allowlist; non-empty = sources found. The "ran-but-empty"
  // case must read DIFFERENTLY from "never run" so the user isn't left wondering if the click
  // did anything (the allowlist legitimately returns 0 for small/new businesses).
  const hasRun = Array.isArray(app.exploredSources)

  const handleSynced = useCallback(async (at: string) => {
    if (app.muapSyncedAt) return
    await runAction(() => markMuapSyncedAction(app.id, at), onUpdate)
  }, [app.id, app.muapSyncedAt, onUpdate])

  async function requestResearch() {
    setResearchLoading(true)
    try {
      // Surface the outcome explicitly — a 0-result run is a valid, common outcome (no
      // authoritative public footprint), not a failure, and must say so rather than look inert.
      await runAction(() => runWebResearchAction(app.id), (updated) => {
        onUpdate(updated)
        const n = updated.exploredSources?.length ?? 0
        if (n > 0) toast.success(`Riset web selesai — ${n} sumber otoritatif ditemukan.`)
        else toast.info('Riset web selesai — tidak ada sumber otoritatif untuk nama usaha ini (wajar untuk usaha kecil/baru). Draft tetap memakai data internal.')
      })
    } finally {
      setResearchLoading(false)
    }
  }


  if (!canView) {
    return (
      <DossierSection
        icon={FileText}
        title="MUAP"
        owners={['RM']}
        status={statusForView(app, 'muap')}
        note="Memorandum Usulan Analisa Pembiayaan — sumber Google Docs (pratinjau hanya-baca)."
      >
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          Dokumen MUAP tidak tersedia untuk peran Anda.
        </div>
      </DossierSection>
    )
  }

  return (
    <DossierSection
      icon={FileText}
      title="MUAP"
      owners={['RM']}
      status={statusForView(app, 'muap')}
      note="Memorandum Usulan Analisa Pembiayaan — sumber Google Docs (pratinjau hanya-baca)."
    >
      <div className="space-y-4">
        {/* Provenance band — §15.4: an always-on "Disusun AI · diverifikasi …" header so the
         *  AI-draft vs human-verified status of the memo is legible at a glance + auditable. */}
        <DocProvenanceBand
          syncedAt={app.muapSyncedAt}
          verifiedLabel="Diperbarui dari analis"
          pendingLabel="Belum diperbarui — perlu review analis"
        />

        <DocsPanel
          appId={app.id}
          seed={buildSeedContext(app)}
          view="muap"
          canManage={canEdit || canGenerateMuap}
          onSynced={handleSynced}
          onGenerate={canGenerateMuap ? () => generateMuapAction(app.id) : undefined}
          onRegenerate={canGenerateMuap ? () => generateMuapAction(app.id, true) : undefined}
        />


        {/* Riset Web — workflow-finetune.md §7. Cited claims from authoritative sources only;
         *  business-entity-only egress; refused for individual nasabah at the classifier. */}
        {(canResearch || sources.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="size-4 text-info" aria-hidden />
                Riset Web
                <StatusChip tone="info" size="sm" dot={false} label="grounded · ada kutipan URL" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pencarian publik untuk fakta bisnis (akta, NIB, sektor, berita usaha) dari sumber
                otoritatif (AHU/Kemenkumham, OJK, IDX, pers tier-1). Hanya nama usaha yang
                dikirim — tidak pernah identitas pribadi pengurus.
              </p>

              {!researchEligible && (
                <div className="rounded-md border border-warning/20 bg-warning-subtle/50 px-3 py-2 text-sm text-warning-foreground">
                  Riset web hanya untuk nasabah <strong>badan usaha</strong> dengan nama usaha
                  yang terdaftar. Untuk perorangan, riset publik tidak diizinkan (PDP Law).
                </div>
              )}

              {sources.length > 0 ? (
                <ul className="space-y-2">
                  {sources.map((s, i) => (
                    <li key={`${s.url}-${i}`} className="rounded-lg border p-3 text-sm">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {s.title}
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                      <p className="mt-1 leading-relaxed">{s.claim}</p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {new URL(s.url).hostname} · diambil{' '}
                        {new Date(s.retrievedAt).toLocaleString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : hasRun ? (
                <div className="flex items-start gap-2 rounded-md border border-info/20 bg-info-subtle/50 px-3 py-2 text-sm text-info-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Riset sudah dijalankan — <strong>tidak ada sumber otoritatif</strong>{' '}
                    (AHU/OSS/OJK/IDX, pers tier-1) untuk nama usaha ini. Wajar untuk usaha kecil
                    atau baru; draft MUAP tetap disusun dari data internal pengajuan.
                  </span>
                </div>
              ) : researchEligible && canResearch ? (
                <p className="text-sm text-muted-foreground">Belum dijalankan. Klik untuk mulai pencarian terbatas.</p>
              ) : null}

              {canResearch && researchEligible && (
                <Button type="button" onClick={requestResearch} disabled={researchLoading} className="gap-2">
                  <Globe2 className="size-4" />
                  {researchLoading ? 'Memuat…' : hasRun ? 'Riset ulang' : 'Jalankan Riset Web'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Maker-checker signature ladder (RM/Analis → Team Leader) — the final act that freezes the
         *  MUAP and carries the application into Risk Review. Mirrors the RSK tab order:
         *  provenance → document → author work (research) → signature ladder. */}
        <ApprovalLadder app={app} chain="muap" onUpdate={onUpdate} />

        {app.komiteDecision && app.approvedPlafond != null && app.approvedTenorMonths != null && (
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Keputusan Komite</span>
              <DecisionChip decision={app.komiteDecision} />
            </div>
            <p className="text-muted-foreground">
              {formatRupiah(app.approvedPlafond)} · {app.approvedTenorMonths} bulan
              {app.approvedMarginRate != null ? ` · margin ${app.approvedMarginRate}%` : ''}
            </p>
          </div>
        )}
      </div>
    </DossierSection>
  )
}
