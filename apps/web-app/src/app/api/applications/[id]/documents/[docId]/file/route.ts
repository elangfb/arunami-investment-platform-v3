import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { getApplication } from '@/server/repo/applications'
import { getDocument } from '@/server/storage/documents'
import { log, errField } from '@/server/log'

// GET /api/applications/:id/documents/:docId/file
// Authenticated retrieval proxy for a stored client document. The object store is
// never exposed to the browser — bytes are streamed only to a verified participant
// (audit-first: any non-observer role may read documents). No presigned/public URLs.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  if (!canParticipate(actor)) {
    return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  }

  const app = await getApplication(id)
  if (!app) return Response.json({ error: 'Aplikasi tidak ditemukan.' }, { status: 404 })

  const doc = app.documents.find((d) => d.id === docId)
  if (!doc || !doc.storageKey) {
    return Response.json({ error: 'Dokumen tidak ditemukan.' }, { status: 404 })
  }

  try {
    const bytes = await getDocument(doc.storageKey)
    const filename = encodeURIComponent(doc.fileName ?? doc.name)
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': doc.contentType ?? 'application/octet-stream',
        'content-disposition': `inline; filename*=UTF-8''${filename}`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    // Storage read failed (object missing / S3 unreachable) — log with ids, not bytes.
    log.error('document.fetch_failed', { appId: id, docId, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal mengambil dokumen.' }, { status: 500 })
  }
}
