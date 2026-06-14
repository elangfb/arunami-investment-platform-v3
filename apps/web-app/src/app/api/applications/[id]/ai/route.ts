import { getApplicationDocs } from '@/server/docs/service'
import { getApplication } from '@/server/repo'
import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'
import { answerAndAudit } from '@/server/ai/assistant'
import { buildPrompt, systemInstruction, type AiAppContext } from '@/server/ai/context'
import { appendCascade } from '@/server/ai/context-inject'

// Per-actor cost/abuse cap on the Gemini-backed chat (in-memory; see rate-limit.ts).
const AI_RATE_LIMIT = 20
const AI_RATE_WINDOW_MS = 60_000

// POST /api/applications/:id/ai — risk-analysis chat grounded in the app facts
// (body) + the latest Doc-extracted snapshot (DB). Body: { prompt, context }.
// Compliance: the actor is verified server-side (non-observer only); the prompt is
// PII-masked before it reaches Gemini and the interaction is audited (see answerAndAudit).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canParticipate(actor)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const rl = rateLimit(`ai:${actor.userId}`, AI_RATE_LIMIT, AI_RATE_WINDOW_MS)
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan AI. Coba lagi sebentar.' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  let body: { prompt?: string; context?: AiAppContext }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { prompt, context } = body
  if (!prompt || !context) return Response.json({ error: 'Missing prompt or context' }, { status: 400 })

  try {
    const app = await getApplication(id)
    if (!app) return Response.json({ error: 'Application not found' }, { status: 404 })
    const { snapshot } = await getApplicationDocs(id)
    // Inject the layered AI context (design §5) at the END of the user prompt, per the 'discussion'
    // surface policy (all 3 layers). answerAndAudit masks the result before egress.
    const rawPrompt = await appendCascade(buildPrompt(context, snapshot, prompt), app, 'discussion')
    const reply = await answerAndAudit({
      appId: id,
      userId: actor.userId,
      surface: 'discussion',
      systemInstruction: await systemInstruction(),
      rawPrompt,
      pii: app,
    })
    return Response.json({ reply })
  } catch (e) {
    log.error('ai.chat_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal memproses permintaan AI.' }, { status: 500 })
  }
}
