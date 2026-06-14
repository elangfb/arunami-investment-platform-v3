'use client'

import { useEffect, useMemo, useState } from 'react'
import { CloudUpload, RefreshCw, FolderPlus, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { DossierSection } from '@/components/application/DossierSection'
import { StatusChip } from '@/components/shared/StatusChip'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import {
  runDiscoveryAction,
  linkDriveFolderAction,
  scaffoldDriveFolderAction,
  listSourceManifestAction,
  type DiscoveryStatus,
  type DiscoveryTarget,
  type ManifestRow,
} from '@/server/actions/discovery-actions'
import type { DocMatch } from '@/lib/doc-discovery/matcher'
import type { LoanApplication } from '@/lib/types'

type Props = { app: LoanApplication }

// The document-DISCOVERY panel (RM-led redesign, design §3 "Document storage"). Two checklist
// cards — "Dokumen Nasabah" (carry-forward identity/legal) vs "Dokumen Pengajuan" (per-deal) —
// reconciled LIVE against the app's two Drive folders. Reconciliation is auto-accepted (no confirm,
// unlike OCR); a re-scan is the explicit "Pindai ulang". The panel is CONTENT-FREE: it shows file
// PATHS/names only and never fetches or renders bytes. The cards are an open read for everyone; the
// link / scaffold / rescan controls are RM-only (gated to the intake desk; the server re-enforces).

/** A docType → human label map from the app's own required-docs snapshot (Bahasa Indonesia). */
function useDocLabels(app: LoanApplication): (docType: string) => string {
  return useMemo(() => {
    const byType = new Map<string, string>()
    for (const d of app.documents) byType.set(d.docType, d.name)
    return (docType: string) => byType.get(docType) ?? docType
  }, [app.documents])
}

/** One checklist card: lists its docTypes with a status chip; satisfied rows show matched file names. */
function ChecklistCard({
  title,
  matches,
  label,
}: {
  title: string
  matches: DocMatch[]
  label: (docType: string) => string
}) {
  const satisfied = matches.filter((m) => m.state === 'satisfied').length
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">
            {satisfied} dari {matches.length} dokumen ditemukan
          </p>
        </div>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada dokumen yang dipersyaratkan untuk kategori ini.</p>
        ) : (
          <ul className="space-y-2.5">
            {matches.map((m) => (
              <li key={m.docType} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label(m.docType)}</p>
                  {m.state === 'satisfied' && (
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {m.matchedPaths.join(', ')}
                    </p>
                  )}
                </div>
                {m.state === 'satisfied' ? (
                  <StatusChip tone="success" label="Lengkap" />
                ) : (
                  <StatusChip tone="neutral" label="Belum ada" />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** The "Hubungkan Folder Drive" inline control for an unlinked scope (paste URL/ID + link). */
function LinkFolderControl({
  target,
  onLink,
}: {
  target: DiscoveryTarget
  onLink: (target: DiscoveryTarget, input: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="mt-3 flex max-w-xl flex-wrap gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tempel URL atau ID folder Google Drive"
        className="min-w-0 flex-1"
      />
      <Button
        size="sm"
        onClick={() => {
          if (!value.trim()) return
          onLink(target, value.trim())
          setValue('')
        }}
        disabled={!value.trim()}
      >
        <CloudUpload className="mr-1.5 size-4" /> Hubungkan
      </Button>
    </div>
  )
}

/** Per-scope RM controls: link (when unlinked) OR rescan + scaffold (when linked). Hidden for non-RM. */
function ScopeControls({
  target,
  linked,
  canManage,
  onLink,
  onRescan,
  onScaffold,
}: {
  target: DiscoveryTarget
  linked: boolean
  canManage: boolean
  onLink: (target: DiscoveryTarget, input: string) => void
  onRescan: () => void
  onScaffold: (target: DiscoveryTarget) => void
}) {
  if (!canManage) return null
  if (!linked) return <LinkFolderControl target={target} onLink={onLink} />
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={onRescan}>
        <RefreshCw className="mr-1.5 size-4" /> Pindai ulang
      </Button>
      <Button size="sm" variant="outline" onClick={() => onScaffold(target)}>
        <FolderPlus className="mr-1.5 size-4" /> Buat struktur folder
      </Button>
    </div>
  )
}

/** The ⚠️ "Tidak dikenali" bucket — files matching zero checklist items, the RM's fix list. */
function UnrecognizedBucket({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null
  return (
    <div className="rounded-lg border border-warning/20 bg-warning-subtle p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-warning-foreground">
        <AlertTriangle className="size-4 shrink-0" /> Tidak dikenali ({paths.length})
      </div>
      <p className="mt-1 text-xs text-warning-foreground/80">
        Ganti nama atau pindahkan file agar cocok dengan checklist.
      </p>
      <ul className="mt-2 space-y-1">
        {paths.map((p) => (
          <li key={p} className="break-words text-xs text-warning-foreground/90">
            {p}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A compact per-scope scan-history table (docType · path · scannedAt). Lazy-loaded on open. */
function ManifestTable({ rows, label }: { rows: ManifestRow[]; label: (docType: string) => string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Belum ada riwayat pindaian.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Dokumen</th>
            <th className="py-1 pr-3 font-medium">Lokasi File</th>
            <th className="py-1 font-medium">Dipindai</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-1 pr-3 align-top">{label(r.docType)}</td>
              <td className="py-1 pr-3 align-top break-all">{r.fullPath}</td>
              <td className="py-1 align-top whitespace-nowrap text-muted-foreground">
                {new Date(r.scannedAt).toLocaleString('id-ID')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DocumentDiscoveryPanel({ app }: Props) {
  const actor = useActor()
  const canManage = hasDesk(actor, 'intake') // RM owns doc collection; server re-enforces.
  const label = useDocLabels(app)

  const [status, setStatus] = useState<DiscoveryStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Riwayat (scan history) disclosure — lazy-loaded on first open.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<{ nasabah: ManifestRow[]; app: ManifestRow[] } | null>(null)

  // Initial scan on mount. runAction toasts a server rejection (e.g. authz) instead of failing silent.
  // (loading/error start at their initial values; DetailClient keys on app.id so an id change remounts.)
  useEffect(() => {
    let active = true
    runAction(
      () => runDiscoveryAction(app.id),
      (s) => {
        if (active) setStatus(s)
      },
    )
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [app.id])

  async function rescan() {
    await runAction(() => runDiscoveryAction(app.id), setStatus)
  }

  async function link(target: DiscoveryTarget, input: string) {
    await runAction(() => linkDriveFolderAction(app.id, target, input), setStatus)
  }

  async function scaffold(target: DiscoveryTarget) {
    await runAction(
      () => scaffoldDriveFolderAction(app.id, target),
      (r) => {
        if (r.warning) toast.warning(r.warning)
        else toast.success(`Struktur folder dibuat (${r.created.length} sub-folder).`)
        void rescan()
      },
    )
  }

  async function toggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && !history) {
      await runAction(() => listSourceManifestAction(app.id), setHistory)
    }
  }

  return (
    <DossierSection
      title="Dokumen dari Drive"
      owners={['RM']}
      note="Pencocokan otomatis dokumen di folder Google Drive nasabah & pengajuan terhadap checklist."
    >
      {loading ? (
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : error || !status ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gagal memuat pencocokan dokumen Drive. Coba muat ulang halaman.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <ChecklistCard title="Dokumen Nasabah" matches={status.result.nasabah.matches} label={label} />
              <ScopeControls
                target="nasabah"
                linked={status.nasabahFolderLinked}
                canManage={canManage}
                onLink={link}
                onRescan={() => void rescan()}
                onScaffold={scaffold}
              />
            </div>
            <div>
              <ChecklistCard title="Dokumen Pengajuan" matches={status.result.pengajuan.matches} label={label} />
              <ScopeControls
                target="app"
                linked={status.appFolderLinked}
                canManage={canManage}
                onLink={link}
                onRescan={() => void rescan()}
                onScaffold={scaffold}
              />
            </div>
          </div>

          <UnrecognizedBucket paths={status.result.unrecognized} />

          <div>
            <Button variant="ghost" size="sm" onClick={() => void toggleHistory()}>
              {historyOpen ? <ChevronDown className="mr-1.5 size-4" /> : <ChevronRight className="mr-1.5 size-4" />}
              Riwayat pindaian
            </Button>
            {historyOpen && (
              <div className="mt-2 space-y-4 rounded-lg border p-3">
                {!history ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Dokumen Nasabah</h4>
                      <ManifestTable rows={history.nasabah} label={label} />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Dokumen Pengajuan</h4>
                      <ManifestTable rows={history.app} label={label} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </DossierSection>
  )
}
