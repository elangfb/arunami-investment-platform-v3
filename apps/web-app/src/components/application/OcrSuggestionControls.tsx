'use client'

import { AlertTriangle, CheckCircle2, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/shared/StatusChip'
import { useActor } from '@/context/ActorProvider'
import { canWorkDeskNow } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { getFieldExtractor } from '@/lib/extraction-registry'
import { confirmExtractedFieldAction } from '@/server/actions/application-data'
import { provenanceFromExtractionSource, provenanceLabel, provenanceTone } from '@/lib/provenance'
import type { ExtractionSource, LoanApplication } from '@/lib/types'

// Routes the per-field ExtractionSource through the shared provenance vocabulary
// (lib/provenance.ts) so per-field, doc-review, and citation surfaces read the same language +
// tones. ocr_suggested = info (review me); ocr_confirmed/human_entered = success (trusted);
// ocr_overridden = success (human-authored). Icons retained for colorblind-safety.
export function ProvenanceBadge({ provenance }: { provenance: ExtractionSource | undefined }) {
  if (!provenance) return null
  const p = provenanceFromExtractionSource(provenance)
  const icon = p === 'suggested' ? AlertTriangle : p === 'overridden' ? PencilLine : CheckCircle2
  return <StatusChip tone={provenanceTone(p)} label={provenanceLabel(p)} icon={icon} />
}

type OcrFieldRowProps = {
  app: LoanApplication
  label: string
  /** registry fieldPath, e.g. 'financialInputs.netMonthlyIncome' — drives the ownerDesk gate. */
  fieldPath: string
  /** Provenance to render (the form passes its live local state; read-only views pass the app's). */
  provenance: ExtractionSource | undefined
  docLabel: string
  onUpdate: (a: LoanApplication) => void
  onViewDocuments: () => void
  /** Optimistic local update for the editable form (which holds provenance in its own state). */
  onConfirmed?: () => void
  /** The value display (read-only) OR an <Input> (editable form). */
  children: React.ReactNode
}

// ONE reusable row for any OCR-suggested field. The "Konfirmasi OCR" affordance + the
// needs-attention triangle appear only when the CURRENT actor can act on the field's owner desk
// right now (canWorkDeskNow = desk held + inside its stage window) — so a non-owner or a frozen
// stage sees the badge (informational) but no dead button. The confirm is the generic,
// registry-driven server action; correcting a gating value still happens in the field's editor.
export function OcrFieldRow({ app, label, fieldPath, provenance, docLabel, onUpdate, onViewDocuments, onConfirmed, children }: OcrFieldRowProps) {
  const actor = useActor()
  const entry = getFieldExtractor(fieldPath)
  const canConfirm = provenance === 'ocr_suggested' && !!entry && canWorkDeskNow(actor, app, entry.ownerDesk)
  // Batch 6 cross-check: a recorded conflict (OCR re-read ≠ the blessed Mizan value) for THIS field.
  const mismatch = app.extractionMismatches?.[fieldPath]
  const canResolve = !!mismatch && !!entry && canWorkDeskNow(actor, app, entry.ownerDesk)

  async function confirm() {
    onConfirmed?.()
    await runAction(() => confirmExtractedFieldAction(app.id, fieldPath), onUpdate)
  }

  async function resolve(resolution: 'keep' | 'accept') {
    await runAction(() => confirmExtractedFieldAction(app.id, fieldPath, undefined, resolution), onUpdate)
  }

  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
      <div className="shrink-0 text-muted-foreground sm:w-[220px]">
        {(canConfirm || mismatch) && <AlertTriangle className="mr-1 inline size-4 text-warning-foreground" />}
        {label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {children}
        <ProvenanceBadge provenance={provenance} />
        {mismatch && <StatusChip tone="warning" label="Selisih OCR" icon={AlertTriangle} />}
        {canConfirm && <Button type="button" size="sm" variant="outline" onClick={confirm}>Konfirmasi OCR</Button>}
        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onViewDocuments}>Lihat {docLabel} ↗</Button>
        {mismatch && (
          <div className="mt-1 flex w-full flex-col gap-1.5 rounded-md border border-warning-foreground/30 bg-warning/10 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Dokumen yang diunggah berbeda dengan nilai tersimpan — <span className="font-medium text-foreground">Mizan: {mismatch.existingValue}</span> · <span className="font-medium text-foreground">Dokumen (OCR): {mismatch.ocrValue}</span>
            </span>
            {canResolve ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void resolve('keep')}>Pertahankan nilai Mizan</Button>
                <Button type="button" size="sm" onClick={() => void resolve('accept')}>Ambil nilai dokumen</Button>
              </div>
            ) : (
              <span className="text-muted-foreground">Menunggu konfirmasi pemilik data.</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
