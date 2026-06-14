'use server'

import { requireActor } from '@/server/auth/session'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { AuthzError } from '@/lib/auth/can'
import { applyPersonalStatusMove } from '@/lib/personal-status'

// Persist a personal Kanban move on the Home board (Tugas Saya ↔ Sedang Diproses). The pure guard
// (applyPersonalStatusMove) enforces the safety rules: only the actor's own latest assignment, never a
// submitted one (the workflow owns that column). `assignment.status` is a personal marker the workflow
// sets but never gates on, so this move is safe.
export async function setPersonalStatusAction(appId: string, status: 'todo' | 'in_progress'): Promise<void> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  const result = applyPersonalStatusMove(app, actor.userId, status)
  if (!result.ok) {
    throw new AuthzError(
      result.reason === 'submitted'
        ? 'Penugasan yang sudah dikirim tidak dapat dipindahkan.'
        : 'Tidak ada penugasan Anda pada aplikasi ini.',
    )
  }
  await saveApplication(app)
}
