'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk } from '@/lib/auth/can'
import { getActiveScheduleTemplates, appendMeetingScheduleTemplateVersion } from '@/server/config/schedule-templates'
import { parseScheduleTemplates } from '@/lib/config/schedule-template-input'
import { materializeMeetingsAhead, type MaterializeResult } from '@/server/scheduling/materialize'

// Stage 5 scheduling admin actions (workflow-finetune.md §8). In production the materializer runs
// daily via Google Cloud Scheduler → POST /api/cron/materialize-meetings (machine-authed by
// CRON_SECRET; replaces the legacy pg-boss daily job). This manual trigger lets ADMIN-MASTER fire it
// on demand for testing + recovery; materialized meetings are proposed agendas and still require CM
// confirmation.

const DEFAULT_HORIZON_DAYS = 14

export async function runMeetingMaterializerAction(daysAhead?: number): Promise<MaterializeResult> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  const templates = await getActiveScheduleTemplates()
  if (!templates.length) return { created: [], skipped: [] }
  const horizon = Math.min(Math.max(1, daysAhead ?? DEFAULT_HORIZON_DAYS), 60)
  return materializeMeetingsAhead(new Date(), horizon, templates, { createdBy: actor.userId })
}

export async function setMeetingScheduleTemplatesAction(
  raw: unknown,
  reason?: string,
): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  const templates = parseScheduleTemplates(raw) // validate + dedupe before it can be persisted
  await appendMeetingScheduleTemplateVersion({
    templates,
    effectiveFrom: new Date(),
    reason: reason?.trim() || null,
    createdBy: actor.userId,
  })
}
