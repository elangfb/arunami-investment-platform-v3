import { freezeDecisionDocs } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'

// POST /api/applications/:id/docs/freeze { decision } → export MUAP+RSK to PDF at
// the committee decision, store an immutable checkpoint, return its metadata.
// Compliance-sensitive (creates the audit-frozen PDFs): auth-gated (non-observer) +
// rate-limited (it calls Google Drive export).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  if (!canParticipate(actor)) return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  const rl = rateLimit(`docs-freeze:${actor.userId}`, 20, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { decision?: string }
    const decision = body.decision ?? 'approve'
    return Response.json(await freezeDecisionDocs(id, decision))
  } catch (e) {
    log.error('docs.freeze_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal membekukan dokumen keputusan.' }, { status: 500 })
  }
}
