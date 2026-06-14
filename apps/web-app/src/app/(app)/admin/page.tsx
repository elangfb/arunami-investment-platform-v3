import { redirect } from 'next/navigation'
import { verifySession } from '@/server/auth/session'
import { hasDesk } from '@/lib/auth/can'
import { listDeskCatalog, listRoles, listUsers } from '@/server/repo/users'
import { getActiveSlaTargets, listSlaPolicyVersions } from '@/server/config/sla'
import { getActiveCommitteeRooms, listCommitteeRoomsVersions } from '@/server/config/rooms'
import { getActiveDisbursementConditions, listDisbursementConditionsVersions } from '@/server/config/disbursement'
import { getActiveRiskPolicy, listRiskPolicyVersions } from '@/server/config/risk-policy'
import { listApprovalRoutingRules } from '@/server/config/approval-routing'
import { getActivePrompt, listAiPromptVersions } from '@/server/config/ai-prompts'
import { getActiveScheduleTemplates } from '@/server/config/schedule-templates'
import { listHolidayCalendarVersions } from '@/server/config/holidays'
import { AI_PROMPT_KEYS, type AiPromptKey } from '@/lib/ai-prompts'
import type { PromptBundle } from '@/components/admin/PromptsTab'
import { AdminConsole } from '@/components/admin/AdminConsole'

// Admin console route. Gated SERVER-SIDE on the verified session: a real superadmin OR any
// holder of an ADMIN-* desk (Phase 5 least-privilege admin). An actor that is impersonating
// has isSuperadmin=false AND only the impersonated desks, so it is redirected out — you must
// stop impersonating to administer. Each console tab is desk-gated (Users → ADMIN-USERS,
// Master → ADMIN-MASTER); superadmin-only controls are hidden client-side + enforced server-side.
export default async function AdminPage() {
  const actor = await verifySession()
  if (!actor) redirect('/dashboard')
  const canUsers = actor.isSuperadmin || hasDesk(actor, 'ADMIN-USERS')
  const canMaster = actor.isSuperadmin || hasDesk(actor, 'ADMIN-MASTER')
  const canPolicy = actor.isSuperadmin || hasDesk(actor, 'ADMIN-POLICY')
  if (!canUsers && !canMaster && !canPolicy) redirect('/dashboard')

  const [
    users,
    roles,
    desks,
    slaTargets,
    slaVersions,
    rooms,
    roomsVersions,
    disbursementConditions,
    disbursementConditionsVersions,
    riskPolicy,
    riskVersions,
    routingRules,
    holidayVersions,
  ] = await Promise.all([
    listUsers(),
    listRoles(),
    listDeskCatalog(),
    getActiveSlaTargets(),
    listSlaPolicyVersions(),
    getActiveCommitteeRooms(),
    listCommitteeRoomsVersions(),
    getActiveDisbursementConditions(),
    listDisbursementConditionsVersions(),
    getActiveRiskPolicy(),
    listRiskPolicyVersions(),
    listApprovalRoutingRules(),
    listHolidayCalendarVersions(),
  ])
  const scheduleTemplates = await getActiveScheduleTemplates()
  // AI system prompts — current + history per surface (one bundle each).
  const aiPromptEntries = await Promise.all(
    AI_PROMPT_KEYS.map(async (key): Promise<[AiPromptKey, PromptBundle]> => {
      const [current, versions] = await Promise.all([getActivePrompt(key), listAiPromptVersions(key)])
      return [key, { current, versions }]
    }),
  )
  const aiPrompts = Object.fromEntries(aiPromptEntries) as Record<AiPromptKey, PromptBundle>
  return (
    <AdminConsole
      users={users}
      roles={roles}
      desks={desks}
      currentUserId={actor.userId}
      isSuperadmin={actor.isSuperadmin}
      canUsers={canUsers}
      canMaster={canMaster}
      canPolicy={canPolicy}
      slaTargets={slaTargets}
      slaVersions={slaVersions}
      rooms={rooms}
      roomsVersions={roomsVersions}
      disbursementConditions={disbursementConditions}
      disbursementConditionsVersions={disbursementConditionsVersions}
      riskPolicy={riskPolicy}
      riskVersions={riskVersions}
      aiPrompts={aiPrompts}
      scheduleTemplates={scheduleTemplates}
      holidayVersions={holidayVersions}
      routingRules={routingRules}
    />
  )
}
