'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AI_PROMPT_KEYS, AI_PROMPT_LABEL, type AiPromptKey } from '@/lib/ai-prompts'
import { setAiPromptAction } from '@/server/actions/policy'
import type { AiPromptVersionRow } from '@/server/config/ai-prompts'

// AI system-prompt admin tab. Each surface (narrative_muap/rsk, advisory_rec, assistant_chat,
// ocr_*) has its own append-only version history; save creates a new version that takes effect
// immediately on the next AI call. Compliance: the hard guards (scrubNarrative, schema-no-field,
// detectResidualPii fail-closed PII) stay enforced in code — a rephrased prompt cannot bypass them.

export interface PromptBundle {
  current: string
  versions: AiPromptVersionRow[]
}

export function PromptsTab({
  prompts,
  onChanged,
}: {
  prompts: Record<AiPromptKey, PromptBundle>
  onChanged: () => void
}) {
  const [activeKey, setActiveKey] = useState<AiPromptKey>(AI_PROMPT_KEYS[0])
  const bundle = prompts[activeKey]
  const [draft, setDraft] = useState<string>(bundle.current)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  // Reset the draft when the selected key changes.
  function selectKey(k: AiPromptKey) {
    setActiveKey(k)
    setDraft(prompts[k].current)
    setReason('')
  }

  const dirty = draft.trim() !== bundle.current.trim()

  function save() {
    startTransition(async () => {
      try {
        await setAiPromptAction(activeKey, draft, reason)
        setReason('')
        toast.success(`Versi baru "${AI_PROMPT_LABEL[activeKey]}" disimpan.`)
        onChanged()
      } catch (e) {
        toast.error((e as Error).message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="flex items-center gap-2 font-heading text-lg font-semibold">
              <Sparkles className="size-4 text-info" aria-hidden /> Prompt sistem AI
            </h3>
            <p className="text-sm text-muted-foreground">
              Tiap permukaan AI memiliki <em>system prompt</em> sendiri (versi append-only,
              berlaku langsung). Pengaman keras (drop vonis/level, skema tanpa field otoritatif,
              backstop PII fail-closed) tetap dipaksakan oleh kode — prompt hanya panduan, bukan
              gerbang keamanan.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Permukaan AI</span>
            <Select value={activeKey} onValueChange={(v) => selectKey(v as AiPromptKey)}>
              <SelectTrigger className="w-full sm:max-w-md">
                <SelectValue>{AI_PROMPT_LABEL[activeKey]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AI_PROMPT_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {AI_PROMPT_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">System prompt (Bahasa Indonesia)</span>
            <textarea
              className="min-h-[260px] w-full rounded-md border bg-background px-3 py-2 text-sm font-mono leading-relaxed"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isPending}
              spellCheck={false}
              aria-label="System prompt"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {draft.length} karakter · min 20, maks 8000
            </span>
          </label>

          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan perubahan (opsional, masuk ke catatan audit)"
            aria-label="Alasan perubahan"
            disabled={isPending}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={save} disabled={!dirty || isPending}>
              Simpan versi baru
            </Button>
            {!dirty && <span className="text-xs text-muted-foreground">Belum ada perubahan terhadap versi aktif.</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-heading text-base font-medium">
            Riwayat versi — {AI_PROMPT_LABEL[activeKey]}
          </h3>
          {bundle.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada versi tersimpan.</p>
          ) : (
            <ul className="space-y-2">
              {bundle.versions.map((v) => (
                <li key={`${v.promptKey}-${v.version}`} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">v{v.version}</Badge>
                    <span className="text-muted-foreground">
                      berlaku {v.effectiveFrom.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-muted-foreground">· oleh {v.createdBy}</span>
                  </div>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs leading-relaxed">
                    {v.systemInstruction}
                  </pre>
                  {v.reason ? <div className="mt-1 italic text-muted-foreground">“{v.reason}”</div> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
