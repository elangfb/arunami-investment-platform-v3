import 'server-only'
import { listUsers } from '@/server/repo/users'
import { ownersFromUsers, type StageOwner } from '@/lib/stage-owners'
import type { Stage } from '@/lib/types'

// Loads live users-with-effective-desks once, then returns a SYNC resolver for dispatch(): the real
// grant-holders for a given stage (role grants ∪ direct grants), not the static seed. Every
// transition action passes this so auto-assignment follows actual desk permissions — an admin-granted
// user lands the app on their Home Kanban the moment it enters a stage they own. One DB read per
// transition (small team; transitions are infrequent).
export async function stageOwnerResolver(): Promise<(stage: Stage) => StageOwner[]> {
  const users = await listUsers()
  return (stage: Stage) => ownersFromUsers(users, stage)
}
