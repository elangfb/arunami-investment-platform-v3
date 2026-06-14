'use client'

import { useRouter } from 'next/navigation'
import { Page } from '@/components/layout/Page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AdminRole, AdminUser, DeskCatalogRow } from '@/server/repo/users'
import type { SlaPolicyVersionRow } from '@/server/config/sla'
import type { CommitteeRoomsVersionRow } from '@/server/config/rooms'
import type { DisbursementConditionsVersionRow } from '@/server/config/disbursement'
import type { RiskPolicyVersionRow } from '@/server/config/risk-policy'
import type { ApprovalRoutingRuleRow } from '@/server/config/approval-routing'
import type { RiskPolicy } from '@/lib/hardGates'
import type { HolidayCalendarVersionRow } from '@/server/config/holidays'
import type { Stage } from '@/lib/types'
import type { MeetingScheduleTemplate } from '@/lib/config/schedule-template-input'
import { UsersTab } from './UsersTab'
import { RolesTab } from './RolesTab'
import { DesksTab } from './DesksTab'
import { MasterTab } from './MasterTab'
import { PolicyTab } from './PolicyTab'
import { RoutingTab } from './RoutingTab'
import { PromptsTab, type PromptBundle } from './PromptsTab'
import type { AiPromptKey } from '@/lib/ai-prompts'

// Admin console shell. The RSC route loads data and gates on actor admin desks; this client
// shell tabs between desk-gated sections and re-pulls fresh data via router.refresh() after
// each mutation. Tabs render only for the desks the actor holds (audit-first: hidden, not
// disabled); superadmin sees everything. Server actions re-enforce every gate.
export function AdminConsole({
  users,
  roles,
  desks,
  currentUserId,
  isSuperadmin,
  canUsers,
  canMaster,
  canPolicy,
  slaTargets,
  slaVersions,
  rooms,
  roomsVersions,
  disbursementConditions,
  disbursementConditionsVersions,
  riskPolicy,
  riskVersions,
  aiPrompts,
  scheduleTemplates,
  holidayVersions,
  routingRules,
}: {
  users: AdminUser[]
  roles: AdminRole[]
  desks: DeskCatalogRow[]
  currentUserId: string
  isSuperadmin: boolean
  canUsers: boolean
  canMaster: boolean
  canPolicy: boolean
  slaTargets: Record<Stage, number>
  slaVersions: SlaPolicyVersionRow[]
  rooms: string[]
  roomsVersions: CommitteeRoomsVersionRow[]
  disbursementConditions: string[]
  disbursementConditionsVersions: DisbursementConditionsVersionRow[]
  riskPolicy: RiskPolicy
  riskVersions: RiskPolicyVersionRow[]
  aiPrompts: Record<AiPromptKey, PromptBundle>
  scheduleTemplates: MeetingScheduleTemplate[]
  holidayVersions: HolidayCalendarVersionRow[]
  routingRules: ApprovalRoutingRuleRow[]
}) {
  const router = useRouter()
  const onChanged = () => router.refresh()
  const defaultTab = canUsers ? 'users' : canMaster ? 'master' : 'policy'

  return (
    <Page.Root>
      <Page.Header
        eyebrow={isSuperadmin ? 'Superadmin' : 'Admin'}
        title="Konsol Akses"
        description="Kelola pengguna, peran, dan konfigurasi. Perubahan langsung berlaku."
      />
      <Tabs defaultValue={defaultTab}>
        <TabsList variant="line" className="h-auto flex-wrap gap-x-1">
          {canUsers ? <TabsTrigger value="users">Pengguna ({users.length})</TabsTrigger> : null}
          {canUsers ? <TabsTrigger value="roles">Peran ({roles.length})</TabsTrigger> : null}
          {canUsers ? <TabsTrigger value="desks">Desk ({desks.length})</TabsTrigger> : null}
          {canUsers ? <TabsTrigger value="routing">Routing Persetujuan</TabsTrigger> : null}
          {canMaster ? <TabsTrigger value="master">Data Master</TabsTrigger> : null}
          {canPolicy ? <TabsTrigger value="policy">Kebijakan Risiko</TabsTrigger> : null}
          {canPolicy ? <TabsTrigger value="prompts">Prompt AI</TabsTrigger> : null}
        </TabsList>
        {canUsers ? (
          <>
            <TabsContent value="users" className="mt-4">
              <UsersTab users={users} roles={roles} desks={desks} currentUserId={currentUserId} isSuperadmin={isSuperadmin} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="roles" className="mt-4">
              <RolesTab roles={roles} desks={desks} isSuperadmin={isSuperadmin} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="desks" className="mt-4">
              <DesksTab desks={desks} />
            </TabsContent>
            <TabsContent value="routing" className="mt-4">
              <RoutingTab rules={routingRules} users={users} onChanged={onChanged} />
            </TabsContent>
          </>
        ) : null}
        {canMaster ? (
          <TabsContent value="master" className="mt-4">
            <MasterTab
              slaTargets={slaTargets}
              slaVersions={slaVersions}
              rooms={rooms}
              roomsVersions={roomsVersions}
              disbursementConditions={disbursementConditions}
              disbursementConditionsVersions={disbursementConditionsVersions}
              scheduleTemplates={scheduleTemplates}
              holidayVersions={holidayVersions}
              onChanged={onChanged}
            />
          </TabsContent>
        ) : null}
        {canPolicy ? (
          <>
            <TabsContent value="policy" className="mt-4">
              <PolicyTab policy={riskPolicy} versions={riskVersions} onChanged={onChanged} />
            </TabsContent>
            <TabsContent value="prompts" className="mt-4">
              <PromptsTab prompts={aiPrompts} onChanged={onChanged} />
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </Page.Root>
  )
}
