import { listDocumentVersions } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { log, errField } from '@/server/log'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  try {
    return Response.json(await listDocumentVersions(id))
  } catch (e) {
    log.error('docs.versions_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal mengambil riwayat versi dokumen.' }, { status: 500 })
  }
}
