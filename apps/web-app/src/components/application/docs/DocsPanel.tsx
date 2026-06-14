'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, FilePlus2, FileText, History, Link2, Loader2, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { docUrl, docPreviewUrl } from '@/lib/docs-api'
import { useApplicationDocs } from '@/lib/use-application-docs'
import { retryDocShortcutsAction } from '@/server/actions/docs-shortcut'
import type { SeedContext } from '@/lib/seed-context'
import { ExtractionPreview } from './ExtractionPreview'

type View = 'muap' | 'rsk'

export function DocsPanel({
  appId,
  seed,
  view,
  canManage,
  onSynced,
  onGenerate,
  onRegenerate,
}: {
  appId: string
  // App slice used to auto-seed the Docs on creation (facts + AI narrative). Sent
  // to the server in the create body because it can't read the in-memory store.
  seed?: SeedContext
  view: View
  canManage: boolean
  // Fired with the extraction timestamp whenever this doc has a successful sync
  // (on load or after the user syncs), so the parent can mirror the sync state
  // onto the application aggregate. Idempotent on the parent side.
  onSynced?: (extractedAt: string) => void
  // N2 (ADR-0018): the MUAP view overrides mint/re-mint to the explicit `generateMuapAction`
  // server action (desk + Inisiasi-phase gated, audited on the app history) instead of the generic
  // /docs/create + /docs/regenerate routes. When provided, these run then the panel re-fetches.
  // The RSK view leaves them undefined and keeps the generic hook handlers.
  onGenerate?: () => Promise<unknown>
  onRegenerate?: () => Promise<unknown>
}) {
  const { state, versions, loading, busy, error, create, regenerate, sync, rollback, refresh } = useApplicationDocs(appId, seed)
  const handleCreate = onGenerate ? () => void onGenerate().then(() => refresh()) : create
  const handleRegenerate = onRegenerate ? () => void onRegenerate().then(() => refresh()) : regenerate

  // P4-C (ADR-0019 §4): when Mizan couldn't drop a shortcut into the user's app folder (missing Editor),
  // the linkage carries a warning + we offer "Coba lagi". The doc still lives Mizan-owned + viewable here.
  const shortcutWarning = state?.linkage?.shortcutWarning ?? null
  const [retryingShortcut, setRetryingShortcut] = useState(false)
  const retryShortcut = async () => {
    setRetryingShortcut(true)
    try {
      await retryDocShortcutsAction(appId)
      await refresh()
    } finally {
      setRetryingShortcut(false)
    }
  }
  const title = view === 'muap' ? 'MUAP — Google Docs (Sumber Data)' : 'RSK — Google Docs (Sumber Data)'
  const currentKindVersions = versions.filter((v) => v.kind === view)
  const okAt = state?.latestReport?.ok ? state.latestReport.extractedAt : undefined

  useEffect(() => {
    if (okAt) onSynced?.(okAt)
  }, [okAt, onSynced])

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-5 text-primary" />
          {title}
          {state?.linkage && <StatusBadge ok={state.latestReport?.ok} hasReport={Boolean(state.latestReport)} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">{error}</p>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : view === 'muap' && state?.linkage?.muapDocId == null ? (
          // N2 (ADR-0018): the MUAP is minted by the explicit "Generate MUAP" — show that affordance
          // whenever the MUAP is absent (no linkage at all, OR a linkage whose muapDocId is still null).
          <NoDoc canManage={canManage} creating={busy === 'create'} onCreate={handleCreate} label="Generate MUAP" />
        ) : !state?.linkage ? (
          <NoDoc canManage={canManage} creating={busy === 'create'} onCreate={handleCreate} />
        ) : (view === 'muap' ? state.linkage.muapDocId : state.linkage.rskDocId) == null ? (
          // Batch 3 T3: the RSK Doc is created at Stage-4 entry — until then the RSK view has nothing.
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Dokumen RSK belum dibuat. RSK otomatis dibuat saat aplikasi masuk Tahap 4 (Risk), berlandaskan MUAP final.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={docUrl((view === 'muap' ? state.linkage.muapDocId : state.linkage.rskDocId)!)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ExternalLink className="mr-2 size-4" />Buka di Google Docs
              </a>
              {canManage && (
                <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={busy !== false} title="Salin ulang template + isi ulang dari fakta terbaru (mis. setelah revisi proposal)">
                  {busy === 'regenerate' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FilePlus2 className="mr-2 size-4" />}
                  Buat ulang
                </Button>
              )}
              {state.latestReport && (
                <span className="text-xs text-muted-foreground">
                  Sinkron terakhir: {new Date(state.latestReport.extractedAt).toLocaleString('id-ID')}
                </span>
              )}
            </div>

            {/* Read-back recovery (replaces the old "Sinkronkan (pemulihan)" jargon button). The
                read-back auto-runs on Stage-4/5 entry; if it hasn't succeeded, show a plain
                user-facing notice + retry — no internal "sync" verb at the user. */}
            {canManage && !state.latestReport?.ok && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="flex items-center gap-2">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden />
                  Mizan belum membaca data terbaru dari dokumen ini.
                </span>
                <Button size="sm" variant="outline" onClick={sync} disabled={busy !== false}>
                  {busy === 'sync' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                  Coba lagi
                </Button>
              </div>
            )}

            {/* P4-C (ADR-0019 §4): the Mizan-owned doc couldn't get a shortcut into the user's app
                folder (Mizan lacks Editor). The doc is safe + viewable here; offer a retry. */}
            {canManage && shortcutWarning && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="flex items-center gap-2">
                  <Link2 className="size-4 shrink-0" aria-hidden />
                  {shortcutWarning}
                </span>
                <Button size="sm" variant="outline" onClick={retryShortcut} disabled={retryingShortcut}>
                  {retryingShortcut ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                  Coba lagi
                </Button>
              </div>
            )}

            {/* Read-only live preview of the Google Doc, the in-app document view.
                Editing happens in the Google tab (the editor cannot be iframed).
                Content renders only for viewers with Google access to the doc. */}
            <figure className="space-y-1">
              <div className="overflow-hidden rounded-md border bg-muted/30">
                <iframe
                  title={view === 'muap' ? 'Pratinjau MUAP (Google Docs)' : 'Pratinjau RSK (Google Docs)'}
                  src={docPreviewUrl((view === 'muap' ? state.linkage.muapDocId : state.linkage.rskDocId)!)}
                  className="h-[600px] w-full"
                  loading="lazy"
                />
              </div>
              <figcaption className="text-xs text-muted-foreground">
                Pratinjau hanya-baca dari Google Docs. Untuk menyunting, gunakan “Buka di Google Docs”.
              </figcaption>
            </figure>

            {state.latestReport && <ReportSummary report={state.latestReport} />}

            <section className="rounded-lg border bg-background/60 p-3">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" aria-hidden />
                <h4 className="text-sm font-semibold">Riwayat versi</h4>
              </div>
              {currentKindVersions.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Belum ada checkpoint versi untuk dokumen ini.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {currentKindVersions.map((version) => (
                    <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{version.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString('id-ID')} · {version.trigger}
                          {version.createdByName ? ` · ${version.createdByName}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={docPreviewUrl(version.docId)} target="_blank" rel="noopener noreferrer">
                          Lihat
                        </a>
                        {canManage && (
                          <Button size="sm" variant="outline" onClick={() => rollback(version.id)} disabled={busy !== false} title="Snapshot versi saat ini dulu, lalu jadikan checkpoint ini sebagai dokumen aktif">
                            {busy === 'rollback' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
                            Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {state.snapshot ? (
              <ExtractionPreview snapshot={state.snapshot} view={view} />
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Belum ada data tersinkron. {canManage ? 'Isi dokumen di Google Docs lalu klik “Sinkronkan”.' : 'Menunggu sinkronisasi oleh petugas.'}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ ok, hasReport }: { ok?: boolean; hasReport: boolean }) {
  if (!hasReport) return <Badge variant="outline">Belum disinkron</Badge>
  return ok ? (
    <Badge className="bg-emerald-100 text-emerald-800"><CheckCircle2 className="mr-1 size-3.5" />Tersinkron</Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-800"><TriangleAlert className="mr-1 size-3.5" />Perlu perbaikan</Badge>
  )
}

function NoDoc({ canManage, creating, onCreate, label = 'Buat Dokumen dari Template' }: { canManage: boolean; creating: boolean; onCreate: () => void; label?: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center">
      <p className="mb-3 text-sm text-muted-foreground">
        Dokumen Google belum dibuat untuk aplikasi ini.
      </p>
      {canManage ? (
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FilePlus2 className="mr-2 size-4" />}
          {label}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Hanya petugas pada tahap terkait yang dapat membuat dokumen.</p>
      )}
    </div>
  )
}

function ReportSummary({ report }: { report: { ok: boolean; fields: { fieldKey: string; status: string; message?: string }[] } }) {
  const flagged = report.fields.filter((f) => f.status !== 'ok')
  if (report.ok && flagged.length === 0) {
    return <p className="text-sm text-emerald-700">Semua field terbaca dengan baik.</p>
  }
  return (
    <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-amber-900">
        {report.ok ? `${flagged.length} field perlu perhatian` : `Snapshot ditolak — ${flagged.length} field bermasalah`}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-900">
        {flagged.slice(0, 12).map((f) => (
          <li key={f.fieldKey}>{f.message ?? `${f.fieldKey}: ${f.status}`}</li>
        ))}
        {flagged.length > 12 && <li>…dan {flagged.length - 12} lainnya</li>}
      </ul>
    </details>
  )
}
