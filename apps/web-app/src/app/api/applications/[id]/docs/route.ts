import { getApplicationDocs } from '@/server/docs/service'
import { ensureDocAccessForActor } from '@/server/docs/access'
import { loadApplicationForWrite } from '@/server/repo/write'
import { verifySession } from '@/server/auth/session'
import { log, errField } from '@/server/log'

// GET /api/applications/:id/docs → linkage + latest report + latest OK snapshot.
// Read of dossier memos/extraction (not raw uploads) → any authenticated user
// (audit-first: observers/auditors may read). Raw KTP bytes stay participant-gated
// on the separate documents/[docId]/file route.
//
// Side effect: the doc panel fetches this on mount, so it is also where we grant the
// viewer just-in-time Google Drive access to the per-app MUAP/RSK Docs (server/docs/
// access.ts) — so a participant never hits Google's "request access" wall, and the
// preview iframe actually renders. Best-effort: a grant failure never fails the read.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  try {
    const docs = await getApplicationDocs(id)
    if (docs.linkage) {
      try {
        const app = await loadApplicationForWrite(id)
        if (app) await ensureDocAccessForActor(actor, app, docs.linkage)
      } catch (e) {
        log.warn('docs.access_ensure_failed', { appId: id, userId: actor.userId, ...errField(e) })
      }
    }
    return Response.json(docs)
  } catch (e) {
    log.error('docs.read_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal memuat dokumen.' }, { status: 500 })
  }
}
