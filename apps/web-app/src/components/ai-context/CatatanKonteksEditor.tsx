'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client-action'

// Shared editor for a layered-AI-context "Catatan" — the sacred human note (RM-led redesign §5 /
// Topic 5). Used for BOTH tracks: Customer.contextMd (Nasabah-scoped) and Application.contextMd
// (app-scoped). Two clearly-separated halves:
//   • the AUTO derived block — READ-ONLY, regenerated live at injection, shown so the human knows what
//     the AI already sees and does not re-type it; never editable here.
//   • the "Catatan" — the editable, free-text, additive human note → onSave (the server action).
// Open to any authenticated participant (attributed server-side). Bahasa; mirrors the Textarea+Simpan
// runAction idiom used elsewhere (e.g. DiscussionTab).

export function CatatanKonteksEditor({
  title,
  description,
  autoBlock,
  initialCatatan,
  placeholder,
  onSave,
}: {
  /** Section heading, e.g. "Catatan Nasabah (konteks AI)". */
  title: string
  /** One-line explainer under the heading. */
  description: string
  /** The live AUTO-derived block (rendered cascade for this layer), shown read-only. '' → hidden. */
  autoBlock: string
  /** The current persisted human note (Customer/Application.contextMd), or null/empty if none yet. */
  initialCatatan: string | null
  /** Placeholder text for the empty Catatan textarea. */
  placeholder: string
  /** Persist the edited note. Resolves with the saved value (or void); rejects → runAction toasts. */
  onSave: (catatan: string) => Promise<unknown>
}) {
  const [catatan, setCatatan] = useState(initialCatatan ?? '')
  const [saved, setSaved] = useState(initialCatatan ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = catatan !== saved

  async function save() {
    setSaving(true)
    await runAction(
      () => onSave(catatan),
      () => {
        setSaved(catatan)
        toast.success('Catatan konteks AI disimpan.')
      },
    )
    setSaving(false)
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary ring-1 ring-primary/10">
          <Sparkles className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold leading-snug text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* AUTO derived block — read-only. The AI sees this automatically; do not re-type it below. */}
      {autoBlock ? (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Konteks otomatis (dihasilkan sistem, hanya-baca)
          </p>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
            {autoBlock}
          </pre>
        </div>
      ) : null}

      {/* Catatan — the editable human note. */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">Catatan (ditulis manusia, ditambahkan ke konteks AI)</label>
        <Textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder={placeholder}
          rows={5}
          disabled={saving}
        />
        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-xs text-muted-foreground">Perubahan belum disimpan</span>}
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>
    </section>
  )
}
