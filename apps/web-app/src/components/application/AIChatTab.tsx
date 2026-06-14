'use client'

import { useState } from 'react'
import { Bot, Loader2, Send } from 'lucide-react'
import { DossierSection } from '@/components/application/DossierSection'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useActor } from '@/context/ActorProvider'
import { hasDesk } from '@/lib/auth/can'
import { runAction } from '@/lib/client-action'
import { askAiAssistantAction } from '@/server/actions/ai-chat'
import type { LoanApplication } from '@/lib/types'

// Dedicated AI risk-assistant for the Analyst / Risk Team. COMPLIANCE (OJK + Bank §1.1)
// is now wired server-side in askAiAssistantAction → answerAndAudit:
//   1. PII masking before the prompt leaves Hijra infra (lib/pii-mask.ts);
//   2. every prompt + masked response audited to AiInteraction (userId, app id, ts);
//   3. a rolling 10-turn window on the thread (aiAssistantLog), which is SEPARATE from the
//      team discussion (aiChatHistory / DiscussionTab).
// Because the prompt is masked, the assistant refers to the customer as [NASABAH] etc. —
// intentional: PII never reaches the model.

type Message = NonNullable<LoanApplication['aiAssistantLog']>[number]
type Props = { app: LoanApplication; onUpdate: (a: LoanApplication) => void }

export function AIChatTab({ app, onUpdate }: Props) {
  const actor = useActor()
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const allowed = hasDesk(actor, 'muap-author') || hasDesk(actor, 'rsk-author')
  const history: Message[] = app.aiAssistantLog ?? []

  const send = async () => {
    const question = text.trim()
    if (!question || thinking) return
    setText('')
    setPending(question)
    setThinking(true)
    await runAction(() => askAiAssistantAction(app.id, question), onUpdate)
    setPending(null)
    setThinking(false)
  }

  return (
    <DossierSection
      icon={Bot}
      title="Asisten Risiko"
      owners={['RM', 'RA']}
      note="Asisten risiko ber-PII-masking — setiap interaksi dicatat untuk audit."
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-warning/20 bg-warning-subtle p-3 text-sm text-warning-foreground">AI bersifat doc-bound di V1 — verifikasi data eksternal secara manual (Google, LinkedIn, kunjungan lapangan). Data pribadi nasabah disamarkan sebelum dikirim ke model.</div>
        {!allowed ? <Card><CardContent className="py-8 text-center text-muted-foreground">AI Chat hanya tersedia untuk Relationship Manager dan Risk Analyst.</CardContent></Card> : (
          <Card><CardContent className="space-y-4">
            <ScrollArea className="h-[400px] rounded-lg border p-4"><div className="space-y-3">
              {history.length === 0 && !pending && <p className="text-center text-sm text-muted-foreground">Mulai tanya jawab berdasarkan dokumen aplikasi ini.</p>}
              {history.map((msg, i) => <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-info-subtle text-info-foreground' : 'bg-muted text-foreground'}`}><p className={`mb-1 text-xs font-semibold ${msg.role === 'user' ? 'text-info-foreground' : 'text-muted-foreground'}`}>{msg.role === 'user' ? 'Anda' : 'MIZAN AI'}</p><p className="leading-relaxed">{msg.content}</p></div></div>)}
              {pending && <div className="flex justify-end"><div className="max-w-[80%] rounded-lg bg-info-subtle px-3 py-2 text-sm text-info-foreground"><p className="mb-1 text-xs font-semibold text-info-foreground">Anda</p><p className="leading-relaxed">{pending}</p></div></div>}
              {thinking && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> MIZAN AI sedang mengetik...</div></div>}
            </div></ScrollArea>
            <div className="flex gap-2"><Textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} placeholder="Tanyakan hal tentang aplikasi pembiayaan ini..." className="min-h-20" disabled={thinking} /><Button onClick={() => void send()} disabled={!text.trim() || thinking} className="self-end"><Send className="mr-2 size-4" /> Kirim</Button></div>
            <p className="text-xs text-muted-foreground">Percakapan ini tersimpan dalam audit trail. Riwayat 10 giliran terakhir dipertahankan.</p>
          </CardContent></Card>
        )}
      </div>
    </DossierSection>
  )
}
