import { syncExtractionFromMarkdown } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { canParticipate } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { log, errField } from '@/server/log'

// POST /api/applications/:id/docs/extract → re-read the Docs via Markdown → AI, persist the run,
// return { report, snapshot }.
// Auth-gated (non-observer) + rate-limited — it reads Google Docs + egresses to the model.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  if (!canParticipate(actor)) return Response.json({ error: 'Akses ditolak.' }, { status: 403 })
  const rl = rateLimit(`docs-extract:${actor.userId}`, 20, 60_000)
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429, headers: { 'retry-after': String(rl.retryAfterSec) } },
    )
  }

  try {
    return Response.json(await syncExtractionFromMarkdown(id, { auditUserId: actor.userId }))
  } catch (e) {
    log.error('docs.extract_failed', { appId: id, userId: actor.userId, ...errField(e) })
    return Response.json({ error: 'Gagal mengekstrak dokumen.' }, { status: 500 })
  }
}
