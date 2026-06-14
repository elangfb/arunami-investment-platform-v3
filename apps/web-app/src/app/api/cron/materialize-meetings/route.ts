import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/server/auth/cron'
import { getActiveScheduleTemplates } from '@/server/config/schedule-templates'
import { materializeMeetingsAhead } from '@/server/scheduling/materialize'
import { log, errField } from '@/server/log'

// POST /api/cron/materialize-meetings — the daily committee-meeting materializer trigger, invoked by
// Google Cloud Scheduler (machine-to-machine; CRON_SECRET as a Bearer token). Replaces the pg-boss
// daily job that goes away with Postgres. The job LOGIC (materializeMeetingsAhead) is backend-aware,
// so this works on either DATA_BACKEND. Idempotent: re-runs skip already-materialized slots, so a
// Scheduler retry is safe. ADMIN-MASTER still has the in-app manual trigger (runMeetingMaterializerAction).
export const dynamic = 'force-dynamic' // never cache; always run live

const DEFAULT_HORIZON_DAYS = 14
const MAX_HORIZON_DAYS = 60

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const templates = await getActiveScheduleTemplates()
    if (!templates.length) return NextResponse.json({ created: [], skipped: [], note: 'no active templates' })
    const daysAhead = Number(new URL(req.url).searchParams.get('daysAhead'))
    const horizon = Math.min(
      Math.max(1, Number.isFinite(daysAhead) && daysAhead > 0 ? daysAhead : DEFAULT_HORIZON_DAYS),
      MAX_HORIZON_DAYS,
    )
    const result = await materializeMeetingsAhead(new Date(), horizon, templates, { createdBy: 'system-cron' })
    log.info('cron.materialize_meetings', { created: result.created.length, skipped: result.skipped.length, horizon })
    return NextResponse.json(result)
  } catch (e) {
    log.error('cron.materialize_meetings_failed', errField(e))
    return NextResponse.json({ error: 'materialize failed' }, { status: 500 })
  }
}
