import { createApplicationDocs } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'
import type { SeedContext } from '@/lib/seed-context'

// POST /api/applications/:id/docs/create → copy masters into per-app Docs and seed
// them from the SeedContext (facts + AI narrative). Body (optional): { seed }.
// The seed is best-effort: a malformed/absent seed just yields an unseeded copy
// (the seeding step is wrapped server-side and never blocks creation).
// Auth-gated (non-observer) + rate-limited — it calls Gemini + Google Drive (cost/egress).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  if (!canParticipate(actor)) return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  const rl = rateLimit(`docs-create:${actor.userId}`, 10, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  let seed: SeedContext | undefined
  try {
    const body = (await req.json()) as { seed?: unknown }
    if (body?.seed && typeof body.seed === 'object') seed = body.seed as SeedContext
  } catch {
    // no/invalid body — fine, seed is optional
  }
  try {
    return Response.json(await createApplicationDocs(id, { seed, auditUserId: actor.userId }))
  } catch (e) {
    log.error('docs.create_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal membuat dokumen.' }, { status: 500 })
  }
}
