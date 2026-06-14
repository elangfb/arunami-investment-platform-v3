import { generateAnalysis } from '@/server/ai/narrative'
import { loadCascadeForSurface } from '@/server/ai/context-layers'
import { getApplication } from '@/server/repo'
import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'
import type { SeedContext } from '@/lib/seed-context'

// POST /api/applications/:id/analysis → AI-draft the 5C+1S aspects (character …
// syariah) from the app data the client sends. Returns { analysis }, a subset map of
// aspect → prose (the verdict guard may drop fields; the client fills the rest from
// the deterministic draft). The server can't read the in-memory store, so the client
// sends the SeedContext in the body.
// Auth-gated (non-observer) + per-actor rate-limited — it calls Gemini.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canParticipate(actor)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const rl = rateLimit(`analysis:${actor.userId}`, 10, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan AI. Coba lagi sebentar.' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  let seed: SeedContext | undefined
  try {
    const body = (await req.json()) as { seed?: unknown }
    if (body?.seed && typeof body.seed === 'object') seed = body.seed as SeedContext
  } catch {
    // fall through to the 400 below
  }
  if (!seed) return Response.json({ error: 'Missing seed' }, { status: 400 })
  try {
    // Layered AI context (design §5) for the 'narrative' surface (all 3 layers), loaded from the
    // real app by id (the body carries only the seed). Best-effort — an empty cascade adds nothing.
    const real = await getApplication(id).catch(() => null)
    const cascade = real ? await loadCascadeForSurface(real, 'narrative').catch(() => '') : ''
    return Response.json({ analysis: await generateAnalysis(seed, actor.userId, cascade) })
  } catch (e) {
    log.error('ai.analysis_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal membuat analisa AI.' }, { status: 500 })
  }
}
