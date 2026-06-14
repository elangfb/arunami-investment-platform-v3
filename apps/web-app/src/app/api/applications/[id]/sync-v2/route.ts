import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'
import { syncDocV2 } from '@/server/docs/sync-v2'
import { getApplication } from '@/server/repo'

// POST /api/applications/:id/sync-v2?docId=...&template=muap|rsk
// Triggers a Doc → App sync for one document. Caller is the v2 MUAPTab/RSKTab on tab
// mount + window focus + detail page open (debounced 10s client-side per design).
//
// Auth: any participant of the app (canParticipate). Read-mostly: a fresh sync is
// safe-by-default — at most updates ApplicationDocumentFill rows that already exist.
// Rate-limited per actor to avoid loops.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const docId = url.searchParams.get('docId')
  const template = url.searchParams.get('template')
  if (!docId || (template !== 'muap' && template !== 'rsk')) {
    return Response.json({ error: 'docId + template (muap|rsk) required' }, { status: 400 })
  }

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  const app = await getApplication(id)
  if (!app) return Response.json({ error: 'Application tidak ditemukan.' }, { status: 404 })
  if (!canParticipate(actor)) {
    return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  }
  void app

  const rl = rateLimit(`sync-v2:${actor.userId}`, 30, 60_000)
  if (!rl.ok) {
    return Response.json({ error: 'Terlalu banyak permintaan sync.' }, { status: 429 })
  }

  try {
    const result = await syncDocV2(docId, template, id)
    return Response.json(result)
  } catch (e: unknown) {
    log.error('sync_v2_route_failed', { appId: id, docId, ...errField(e) })
    return Response.json({ error: 'Gagal sinkronisasi dokumen.' }, { status: 500 })
  }
}
