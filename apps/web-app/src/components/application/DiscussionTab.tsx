'use client'

import { useMemo, useState } from 'react'
import { Loader2, MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { DossierSection } from '@/components/application/DossierSection'
import { useActor } from '@/context/ActorProvider'
import { canParticipate } from '@/lib/auth/can'
import { cn } from '@/lib/utils'
import { appendDiscussionAction } from '@/server/actions/application-data'
import { synthesizeAiReply } from '@/lib/ai-chat'
import { askApplicationAi, buildAiContext } from '@/lib/ai-api'
import type { LoanApplication } from '@/lib/types'

type Props = { app: LoanApplication; onUpdate: (a: LoanApplication) => void }
const quickPrompts = ['Cek Dokumen', 'Status Finansial', 'Review Jaminan', 'Ringkas Risiko', 'Apa yang kurang?']

export function DiscussionTab({ app, onUpdate }: Props) {
  const actor = useActor()
  const canPost = canParticipate(actor)
  const [filter, setFilter] = useState('Semua')
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const messages = app.aiChatHistory
  // Mentionable = the people working THIS application (distinct assignment owners), minus self.
  const participants = useMemo(() => {
    const seen = new Set<string>()
    return app.assignments
      .filter((a) => a.userId !== actor.userId && !seen.has(a.userId) && seen.add(a.userId))
      .map((a) => ({ userId: a.userId, userName: a.userName }))
  }, [app.assignments, actor.userId])
  const nameById = useMemo(() => new Map(participants.map((p) => [p.userId, p.userName])), [participants])
  const [mentions, setMentions] = useState<string[]>([])
  const filteredMessages = messages.filter((msg) => {
    if (filter === 'Semua') return true
    if (filter === 'Tim') return msg.role === 'user' || (msg as { authorType?: string }).authorType === 'human'
    if (filter === 'AI') return msg.role === 'assistant' || (msg as { authorType?: string }).authorType === 'ai'
    if (filter === 'Sistem') return (msg as { role?: string; type?: string }).role === 'system' || (msg as { type?: string }).type === 'system'
    if (filter === 'Pinned') return Boolean((msg as { pinned?: boolean; isPinned?: boolean }).pinned || (msg as { pinned?: boolean; isPinned?: boolean }).isPinned)
    return true
  })

  async function push(role: 'user' | 'assistant', content: string, msgMentions: string[] = []) {
    // The message + its audit entry are appended server-side (compliance: AI
    // interactions are logged with the verified actor); the fresh app is returned.
    onUpdate(await appendDiscussionAction(app.id, role, content, msgMentions))
  }

  function send() {
    const body = text.trim()
    if (!body || !canPost) return
    const picked = mentions
    setText('')
    setMentions([])
    void push('user', body, picked)
  }

  async function askAi(prompt: string) {
    if (thinking) return
    setThinking(true)
    try {
      const reply = await askApplicationAi(app.id, prompt, buildAiContext(app))
      push('assistant', reply)
    } catch {
      // Graceful fallback to the deterministic synthesis if the LLM is
      // unavailable (no key, quota, network).
      push('assistant', synthesizeAiReply(app, prompt))
    } finally {
      setThinking(false)
    }
  }

  return (
    <DossierSection icon={MessagesSquare} title="Diskusi" note="Diskusi tim & asisten AI untuk aplikasi ini.">
      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap gap-2">{['Semua', 'Tim', 'AI', 'Sistem', 'Pinned'].map((item) => <Button key={item} size="sm" variant={filter === item ? 'default' : 'outline'} onClick={() => setFilter(item)}>{item}</Button>)}</div>
          <div className="space-y-3 rounded-lg border bg-background/60 p-3">
            {messages.length === 0 && <p className="text-center text-sm text-muted-foreground">Belum ada diskusi. Ketik pesan ke tim atau tanya AI.</p>}
            {messages.length > 0 && filteredMessages.length === 0 && <p className="text-center text-sm text-muted-foreground">Tidak ada pesan untuk filter {filter}.</p>}
            {filteredMessages.map((msg, index) => <div key={index} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}><div className={msg.role === 'user' ? 'max-w-[80%] rounded-lg bg-info px-3 py-2 text-sm text-primary-foreground' : 'max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'}><p className="mb-1 text-xs font-semibold">{msg.authorName ?? (msg.role === 'user' ? 'Tim' : 'MIZAN AI')}</p><p className="whitespace-pre-line">{msg.content}</p>{msg.mentions && msg.mentions.length > 0 && <p className="mt-1 text-xs opacity-80">Menyebut: {msg.mentions.map((id) => nameById.get(id) ?? id).join(', ')}</p>}</div></div>)}
            {thinking && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> AI sedang membaca data aplikasi...</div>}
          </div>
          <div className="flex flex-wrap gap-2">{quickPrompts.map((prompt) => <Button key={prompt} variant="outline" size="sm" onClick={() => void askAi(prompt)}>Tanya AI: {prompt}</Button>)}</div>
          <div className="space-y-2">
            {canPost && participants.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Sebut:</span>
                {participants.map((p) => {
                  const on = mentions.includes(p.userId)
                  return (
                    <button key={p.userId} type="button" aria-pressed={on} onClick={() => setMentions((m) => (on ? m.filter((id) => id !== p.userId) : [...m, p.userId]))} className={cn('rounded-full border px-2 py-0.5 text-xs transition-colors', on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent')}>@{p.userName}</button>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik pesan ke tim atau tanya AI..." disabled={!canPost} /><Button onClick={send} disabled={!text.trim() || !canPost}>Kirim</Button></div>
          </div>
        </CardContent>
      </Card>
    </DossierSection>
  )
}
