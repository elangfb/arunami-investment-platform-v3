import { regenerateApplicationDocs } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { hasDesk, auditUserName } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'
import type { SeedContext } from '@/lib/seed-context'

// POST /api/applications/:id/docs/regenerate → snapshot the linked Docs, then copy+seed a FRESH
// MUAP/RSK pair (e.g. after a pre-Komite ReviseProposal changed facts and reset maker-checker).
// MUAP-author desk only; rate-limited (Gemini + Drive). Superseded Docs remain reachable via the
// per-document version history instead of becoming invisible Drive orphans.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  if (!hasDesk(actor, 'muap-author')) return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  const rl = rateLimit(`docs-regen:${actor.userId}`, 10, 60_000)
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
    return Response.json(await regenerateApplicationDocs(id, { seed, auditUserId: actor.userId, auditUserName: auditUserName(actor) }))
  } catch (e) {
    log.error('docs.regenerate_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal membuat ulang dokumen.' }, { status: 500 })
  }
}
