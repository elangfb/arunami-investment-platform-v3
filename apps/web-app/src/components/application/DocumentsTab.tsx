'use client'

import { useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { DossierSection } from '@/components/application/DossierSection'
import { DocumentDiscoveryPanel } from '@/components/application/DocumentDiscoveryPanel'
import { AlertTriangle } from 'lucide-react'
import { StatusChip } from '@/components/shared/StatusChip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { SegmentedToggle } from '@/components/ui/form-section'
import { useActor } from '@/context/ActorProvider'
import { canActOnDesk, canWorkDeskNow } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { ownerDeskForDocType } from '@/lib/required-docs'
import {
  renameSupportingDocAction,
  uploadRequiredDocAction,
  uploadPefindoAction,
  uploadSlikAction,
  uploadSupportingDocAction,
  verifyDocumentAction,
} from '@/server/actions/application-data'
import { completeLegalAction, type CompleteLegalInput } from '@/server/actions/application-stage'
import type { ApplicationDocument, DocumentStatus, LoanApplication } from '@/lib/types'

type Props = { app: LoanApplication; onUpdate: (a: LoanApplication) => void }

const statusMap: Record<DocumentStatus, { label: string; tone: 'warning' | 'info' }> = {
  missing: { label: 'Belum diunggah', tone: 'warning' },
  uploaded: { label: 'Terunggah', tone: 'info' },
}

const requiredStatusOrder: Record<DocumentStatus, number> = {
  missing: 0,
  uploaded: 1,
}

/** Wrap an uploaded File as FormData for the server action (key `file`). */
function fileForm(file: File): FormData {
  const fd = new FormData()
  fd.set('file', file)
  return fd
}

/** Authenticated retrieval URL for a stored document (proxied — never a direct store URL). */
function docFileHref(appId: string, docId: string): string {
  return `/api/applications/${appId}/documents/${docId}/file`
}

function DocumentLabel({ doc, appId }: { doc: ApplicationDocument; appId: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-muted p-2"><FileText className="size-5 text-muted-foreground" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{doc.name}</p>
          {!doc.required && <Badge variant="outline">Opsional</Badge>}
          <Badge variant="outline">{doc.docType}</Badge>
        </div>
        {doc.fileName &&
          (doc.storageKey ? (
            <a
              href={docFileHref(appId, doc.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary underline-offset-2 hover:underline"
            >
              {doc.fileName}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">{doc.fileName}</p>
          ))}
      </div>
    </div>
  )
}

function RequiredStatusControl({ doc, canUpload, onUpload }: { doc: ApplicationDocument; canUpload: boolean; onUpload: (doc: ApplicationDocument, file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  if (doc.status === 'missing') {
    // Upload rights are per-row (`ownerDeskForDocType`) so SLIK/Pefindo can live in the same list.
    if (!canUpload) return <StatusChip tone={statusMap.missing.tone} label={statusMap.missing.label} />
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onUpload(doc, file)
            event.target.value = ''
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="border-warning/20 bg-warning-subtle text-warning-foreground hover:bg-warning-subtle/80 hover:text-warning-foreground"
          onClick={() => inputRef.current?.click()}
        >
          Upload {doc.name}
        </Button>
      </>
    )
  }

  const status = statusMap[doc.status]
  return <StatusChip tone={status.tone} label={status.label} />
}

function FriendlyNameControl({ doc, canRename, onRename }: { doc: ApplicationDocument; canRename: boolean; onRename: (docId: string, name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(doc.name)
  if (doc.required || !doc.storageKey) return null
  if (!canRename) return null
  if (!editing) return <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Ubah nama</Button>
  return (
    <div className="mt-2 flex max-w-md gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama dokumen yang mudah dibaca" />
      <Button size="sm" onClick={() => { onRename(doc.id, name); setEditing(false) }} disabled={!name.trim()}>Simpan</Button>
      <Button size="sm" variant="ghost" onClick={() => { setName(doc.name); setEditing(false) }}>Batal</Button>
    </div>
  )
}


// Legal review state as a chip — read-only, shown to everyone once legal review is in
// play (audit value: any role can see whether a doc passed legal). Sits on the doc row,
// beside the upload-status chip.
function LegalStatusChip({ doc }: { doc: ApplicationDocument }) {
  if (doc.legalVerification === 'pass') return <StatusChip tone="success" label="Sah" />
  if (doc.legalVerification === 'fail') return <StatusChip tone="danger" label="Tidak sah" />
  return <StatusChip tone="neutral" label="Belum ditinjau" />
}

// LG-only verify actions, rendered below the row so the chip scan stays clean.
function LegalActions({
  doc,
  onVerify,
}: {
  doc: ApplicationDocument
  onVerify: (docId: string, value: 'pass' | 'fail', reason?: string) => void
}) {
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState(doc.legalVerificationReason ?? '')
  const trimmed = reason.trim()

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={doc.legalVerification === 'pass' ? 'default' : 'outline'}
          className={doc.legalVerification === 'pass' ? 'ring-2 ring-success/20' : undefined}
          onClick={() => { setReasonOpen(false); onVerify(doc.id, 'pass') }}
        >
          Verifikasi Keaslian &amp; Keabsahan
        </Button>
        <Button
          size="sm"
          variant={doc.legalVerification === 'fail' ? 'destructive' : 'outline'}
          className={doc.legalVerification === 'fail' ? 'ring-2 ring-danger/20' : undefined}
          onClick={() => {
            if (!reasonOpen) {
              setReasonOpen(true)
              return
            }
            onVerify(doc.id, 'fail', trimmed)
          }}
          disabled={reasonOpen && !trimmed}
        >
          {reasonOpen ? 'Simpan Tidak Sah' : 'Keaslian/Keabsahan Diragukan'}
        </Button>
        {reasonOpen && (
          <Button size="sm" variant="ghost" onClick={() => setReasonOpen(false)}>
            Batal
          </Button>
        )}
      </div>
      {reasonOpen && (
        <div className="max-w-xl space-y-1.5 rounded-lg border border-danger/20 bg-danger-subtle p-3">
          <label className="text-xs font-medium text-danger-foreground" htmlFor={`legal-fail-${doc.id}`}>
            Alasan dokumen tidak sah / diragukan
          </label>
          <Textarea
            id={`legal-fail-${doc.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Mis. tanda tangan tidak konsisten, masa berlaku habis, atau data tidak sesuai dokumen pendukung."
            rows={2}
          />
          <p className="text-xs text-danger-foreground/80">Wajib diisi untuk jejak audit dan tindak lanjut RM.</p>
        </div>
      )}
    </div>
  )
}

function LegalFailReason({ doc }: { doc: ApplicationDocument }) {
  if (doc.legalVerification !== 'fail' || !doc.legalVerificationReason?.trim()) return null
  return (
    <div className="mt-2 rounded-lg border border-danger/20 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground">
      <span className="font-semibold">Alasan Legal:</span> {doc.legalVerificationReason}
    </div>
  )
}

type LegalOpinion = NonNullable<CompleteLegalInput['opinion']>

const LEGAL_OPINION_OPTIONS: { value: LegalOpinion; label: string }[] = [
  { value: 'layak', label: 'Layak' },
  { value: 'layak-dengan-catatan', label: 'Layak dgn Catatan' },
  { value: 'tidak-layak', label: 'Tidak Layak' },
]
const LEGAL_OPINION_LABELS: Record<LegalOpinion, string> = {
  layak: 'Layak',
  'layak-dengan-catatan': 'Layak dengan Catatan',
  'tidak-layak': 'Tidak Layak',
}
// Shape-coded chip tone: tidak-layak = warning/triangle (a SIGNAL, NOT a blocker — the deal still
// proceeds; Risk/Komite weigh it). layak/layak-dengan-catatan = success/info. Never colour alone.
function LegalOpinionChip({ opinion }: { opinion: LegalOpinion }) {
  if (opinion === 'tidak-layak') return <StatusChip tone="warning" label={LEGAL_OPINION_LABELS[opinion]} icon={AlertTriangle} />
  return <StatusChip tone={opinion === 'layak' ? 'success' : 'info'} label={LEGAL_OPINION_LABELS[opinion]} />
}

// LG records the structured Analisa Yuridis opinion + catatan and COMPLETES the deliverable (gate
// passes regardless of opinion value — "completion gates; the verdict doesn't"). Submitted via
// completeLegalAction({opinion, catatan, notes}). The recorded opinion renders as a shape-coded chip.
function LegalOpinionPanel({
  app,
  canRecord,
  blocked,
  blockerCount,
  onUpdate,
}: {
  app: LoanApplication
  canRecord: boolean
  blocked: boolean
  blockerCount: number
  onUpdate: (a: LoanApplication) => void
}) {
  const recordedOpinion = app.stage2LegalApproval?.opinion
  const recordedCatatan = app.stage2LegalApproval?.catatan ?? []
  const legalDone = Boolean(app.stage2LegalApproval?.verifiedByLG)

  const [opinion, setOpinion] = useState<LegalOpinion>(recordedOpinion ?? 'layak')
  const [catatanText, setCatatanText] = useState(recordedCatatan.join('\n'))
  const [busy, setBusy] = useState(false)

  // Read-only completed state (for non-LG roles, or LG after completion when it can no longer edit).
  if (legalDone && !canRecord) {
    return (
      <div className="space-y-2 rounded-lg border border-success/30 bg-success/5 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-success-foreground">Analisa Yuridis selesai</span>
          {recordedOpinion && <LegalOpinionChip opinion={recordedOpinion} />}
        </div>
        {recordedCatatan.length > 0 && (
          <ul className="ml-4 list-disc text-sm text-muted-foreground">
            {recordedCatatan.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </div>
    )
  }

  if (!canRecord) return null

  async function submit() {
    setBusy(true)
    try {
      const catatan = catatanText.split('\n').map((c) => c.trim()).filter(Boolean)
      await runAction(
        async () => (await completeLegalAction(app.id, {
          opinion,
          ...(catatan.length ? { catatan } : {}),
        })).app,
        onUpdate,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">Opini Analisa Yuridis</p>
        {legalDone && recordedOpinion && <LegalOpinionChip opinion={recordedOpinion} />}
      </div>
      <SegmentedToggle value={opinion} onChange={setOpinion} options={LEGAL_OPINION_OPTIONS} />
      {opinion === 'tidak-layak' && (
        <div className="flex items-start gap-1.5 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Opini &ldquo;Tidak Layak&rdquo; tetap menyelesaikan deliverable (bukan penghalang) — menjadi sinyal yang ditimbang Risk/Komite.</span>
        </div>
      )}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Catatan (satu poin per baris, opsional)</span>
        <Textarea value={catatanText} onChange={(e) => setCatatanText(e.target.value)} rows={3} placeholder="Mis. sertifikat masih atas nama pemilik lama — perlu balik nama sebelum akad." />
      </label>
      {blocked && (
        <p className="text-xs text-warning-foreground">{blockerCount} dokumen belum diverifikasi — selesaikan verifikasi sebelum menyelesaikan Analisa Yuridis.</p>
      )}
      <Button size="sm" disabled={blocked || busy} onClick={submit}>
        {legalDone ? 'Perbarui Analisa Yuridis' : 'Selesaikan Analisa Yuridis'}
      </Button>
    </div>
  )
}

export function DocumentsTab({ app, onUpdate }: Props) {
  const actor = useActor()
  const canUploadSupporting = canActOnDesk(actor, app)
  const showLegal = canWorkDeskNow(actor, app, 'legal') // ADR-0007: Stage-2 Analisa Yuridis, editable through MUAP prep.
  const existingSlikDoc = app.documents.find((doc) => doc.docType === 'slik_report')
  const existingPefindoDoc = app.documents.find((doc) => doc.docType === 'pefindo_report')
  const slikDoc: ApplicationDocument = existingSlikDoc ?? { id: `${app.id}-slik`, name: 'Laporan SLIK', docType: 'slik_report', status: 'missing', required: true }
  const pefindoDoc: ApplicationDocument = existingPefindoDoc ?? { id: `${app.id}-pefindo`, name: 'Laporan Pefindo', docType: 'pefindo_report', status: 'missing', required: false }
  const requiredDocs = [...app.documents.filter((doc) => doc.required && doc.docType !== 'slik_report'), slikDoc]
    .sort((a, b) => requiredStatusOrder[a.status] - requiredStatusOrder[b.status])
  const supportingDocs = [...app.documents.filter((doc) => !doc.required && doc.docType !== 'pefindo_report'), pefindoDoc]
  const uploadedRequired = requiredDocs.filter((doc) => doc.status === 'uploaded').length
  const totalRequired = requiredDocs.length
  const canUploadDoc = (doc: ApplicationDocument) => canWorkDeskNow(actor, app, ownerDeskForDocType(doc.docType))
  // Legal review is "in play" from stage 2 (or earlier if LG already verified something),
  // which is when the read-only legal chip appears beside the upload chip for every role.
  const legalReviewStarted = app.stage >= 2 || app.documents.some((d) => d.legalVerification != null)
  // Legal scope = required non-SLIK docs. Drives the Analisa-Yuridis progress count.
  const legalScope = requiredDocs.filter((d) => d.docType !== 'slik_report' && d.name !== 'SLIK Report')
  const verifiedRequired = legalScope.filter((d) => d.legalVerification === 'pass').length
  // Blocker count mirrors the server gate (legalUnverified): every legal-scope doc must be `pass`.
  const legalBlockerCount = legalScope.filter((d) => d.legalVerification !== 'pass').length
  const supportingInputRef = useRef<HTMLInputElement>(null)

  const legalDone = Boolean(app.stage2LegalApproval?.verifiedByLG)

  // All wrapped in runAction so a server rejection (desk authz) toasts instead of failing silently (F3).
  async function saveLegalVerification(docId: string, value: 'pass' | 'fail', reason?: string) {
    await runAction(() => verifyDocumentAction(app.id, docId, value, reason), onUpdate)
  }

  async function uploadDocument(doc: ApplicationDocument, file: File) {
    if (doc.docType === 'slik_report') {
      await runAction(() => uploadSlikAction(app.id, fileForm(file)), onUpdate)
    } else if (doc.docType === 'pefindo_report') {
      await runAction(() => uploadPefindoAction(app.id, fileForm(file)), onUpdate)
    } else {
      await runAction(() => uploadRequiredDocAction(app.id, doc.id, fileForm(file)), onUpdate)
    }
  }

  async function uploadSupportingDocument(file: File) {
    await runAction(() => uploadSupportingDocAction(app.id, fileForm(file)), onUpdate)
  }

  async function renameSupportingDocument(docId: string, name: string) {
    await runAction(() => renameSupportingDocAction(app.id, docId, name), onUpdate)
  }

  return (
    <div className="space-y-8">
    <DossierSection
      icon={FileText}
      title="Dokumen"
      owners={['RM', 'LG', 'RA']}
      note="Kelengkapan & verifikasi keaslian dokumen nasabah."
      actions={canUploadSupporting ? (
        <>
          <input
            ref={supportingInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) uploadSupportingDocument(file)
              event.target.value = ''
            }}
          />
          <Button onClick={() => supportingInputRef.current?.click()}>Upload Dokumen</Button>
        </>
      ) : undefined}
    >
      <Card>
        <CardContent className="space-y-6">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Dokumen Wajib</h3>
            <p className="text-sm text-muted-foreground">
              {showLegal
                ? `${verifiedRequired} dari ${legalScope.length} dokumen terverifikasi`
                : `${uploadedRequired} dari ${totalRequired} dokumen wajib terunggah`}
            </p>
          </div>
          {/* Analisa Yuridis is a tracked deliverable (ADR-0007 + P3-D §4): LG records a STRUCTURED opinion
              (layak / layak-dengan-catatan / tidak-layak) + catatan here — the verdict is a SIGNAL, never a
              blocker. The rows below show per-doc verification (the prerequisite); this header captures the
              opinion. Gates the MUAP→Risk submit, not the 2→3 advance. */}
          {(showLegal || (legalDone && app.stage2LegalApproval?.opinion)) && (
            <div className="mt-3 space-y-3 rounded-lg border p-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{legalDone ? 'Analisa Yuridis selesai' : 'Analisa Yuridis belum selesai'}</p>
                <p className="text-sm text-muted-foreground">
                  {verifiedRequired} dari {legalScope.length} dokumen legal terverifikasi. Hasil ini menjadi prasyarat MUAP dikirim ke Risk.
                </p>
              </div>
              <LegalOpinionPanel
                app={app}
                canRecord={showLegal}
                blocked={legalBlockerCount > 0}
                blockerCount={legalBlockerCount}
                onUpdate={onUpdate}
              />
            </div>
          )}
          <div className="mt-3">
            {requiredDocs.map((doc, index) => (
              <div key={doc.id}>
                <div className="flex items-start justify-between gap-3 py-1">
                  <DocumentLabel doc={doc} appId={app.id} />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <RequiredStatusControl doc={doc} canUpload={canUploadDoc(doc)} onUpload={uploadDocument} />
                    {legalReviewStarted && doc.status === 'uploaded' && <LegalStatusChip doc={doc} />}
                  </div>
                </div>
                <LegalFailReason doc={doc} />
                {showLegal && doc.status === 'uploaded' && (
                  <LegalActions doc={doc} onVerify={saveLegalVerification} />
                )}
                {index < requiredDocs.length - 1 && <Separator className="my-4" />}
              </div>
            ))}
          </div>
        </section>

        {supportingDocs.length > 0 && (
          <section>
            <h3 className="font-semibold">Dokumen Pendukung</h3>
            <div className="mt-3">
              {supportingDocs.map((doc, index) => (
                <div key={doc.id}>
                  <div className="flex items-start justify-between gap-3 py-1">
                    <DocumentLabel doc={doc} appId={app.id} />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <RequiredStatusControl doc={doc} canUpload={canUploadDoc(doc)} onUpload={uploadDocument} />
                      {legalReviewStarted && doc.status === 'uploaded' && <LegalStatusChip doc={doc} />}
                    </div>
                  </div>
                  <FriendlyNameControl doc={doc} canRename={canUploadSupporting} onRename={renameSupportingDocument} />
                  <LegalFailReason doc={doc} />
                  {showLegal && doc.status === 'uploaded' && (
                    <LegalActions doc={doc} onVerify={saveLegalVerification} />
                  )}
                  {index < supportingDocs.length - 1 && <Separator className="my-4" />}
                </div>
              ))}
            </div>
          </section>
        )}
        </CardContent>
      </Card>
    </DossierSection>

      {/* Document discovery — the two-card Drive reconciliation (RM-led redesign, design §3).
          Rendered AFTER the upload/verify checklist; its own DossierSection, content-free. */}
      <DocumentDiscoveryPanel app={app} />
    </div>
  )
}
