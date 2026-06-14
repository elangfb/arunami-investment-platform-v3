import { checkpointPdf } from '@/server/docs/service'
import { verifySession } from '@/server/auth/session'
import { log, errField } from '@/server/log'

// GET /api/applications/:id/docs/checkpoint?doc=muap|rsk → stream the frozen PDF
// captured at the committee decision (the immutable audit copy).
// Read of the audit-frozen memo → any authenticated user (audit-first: the OJK
// auditor must be able to read the immutable decision record).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await verifySession()
  if (!actor) return Response.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  const which = new URL(req.url).searchParams.get('doc') === 'rsk' ? 'rsk' : 'muap'
  try {
    const pdf = await checkpointPdf(id, which)
    if (!pdf) return Response.json({ error: 'No checkpoint for this application.' }, { status: 404 })
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${which.toUpperCase()}-${id}-beku.pdf"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    log.error('docs.checkpoint_failed', { appId: id, userId: actor.userId, doc: which, ...errField(e) })
    return Response.json({ error: 'Gagal mengambil dokumen beku.' }, { status: 500 })
  }
}
