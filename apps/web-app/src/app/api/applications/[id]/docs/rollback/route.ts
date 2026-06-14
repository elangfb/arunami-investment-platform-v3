import { rollbackApplicationDocVersion } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { hasDesk, auditUserName } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'
import { getDocumentVersion } from '@/server/repo/document-version'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  // Body is parsed before desk-gating because the selected checkpoint determines whether
  // MUAP-author or RSK-author owns the rollback. The service still validates app/stage/version.
  const rl = rateLimit(`docs-rollback:${actor.userId}`, 10, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }
  let versionId = ''
  try {
    const body = (await req.json()) as { versionId?: unknown }
    if (typeof body.versionId === 'string') versionId = body.versionId
  } catch {
    // handled below
  }
  if (!versionId) return Response.json({ error: 'Versi dokumen wajib dipilih.' }, { status: 400 })
  const version = await getDocumentVersion(id, versionId)
  if (!version || version.applicationId !== id) {
    return Response.json({ error: 'Versi dokumen tidak ditemukan.' }, { status: 404 })
  }
  const requiredDesk = version.kind === 'rsk' ? 'rsk-author' : 'muap-author'
  if (!hasDesk(actor, requiredDesk)) return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  try {
    return Response.json(await rollbackApplicationDocVersion(id, versionId, { createdBy: actor.userId, createdByName: auditUserName(actor) }))
  } catch (e) {
    log.error('docs.rollback_failed', { appId: id, userId: actor.userId, versionId, ...errField(e) })
    return Response.json({ error: (e as Error).message || 'Gagal rollback dokumen.' }, { status: 500 })
  }
}
