'use server'

import { requireActor } from '@/server/auth/session'
import type { Desk } from '@/lib/desks'
import type { ColekRow } from '@/server/repo/colek'
import {
  colekDeskForActor,
  completeColekForActor,
  rejectColekForActor,
  reassignColekForActor,
  listColeksForAppForActor,
} from './colek-actions.core'

// Thin 'use server' wrappers for the COLEK UI (the incoming-colek panel + the desk-colek control).
// Each resolves the real actor (requireActor) then delegates to the actor-injected core
// (colek-actions.core.ts), which holds the gate + logic and is itest-able with a test Actor. The core
// is server-only and NOT a server action, so the actor-trusting entry points are never exposed over
// the wire. See the core for the full design contract (sticky reuse; load-balanced first assignment;
// audit on the application via appendHistory).

export type { ColekRow } from '@/server/repo/colek'

/** COLEK an application's targetDesk: a participant requests cross-desk work (sticky-reused if open). */
export async function colekDeskAction(appId: string, targetDesk: Desk, description: string): Promise<ColekRow> {
  return colekDeskForActor(await requireActor(), appId, targetDesk, description)
}

/** The assignee (or a desk peer) marks a colek done. */
export async function completeColekAction(colekId: string): Promise<ColekRow> {
  return completeColekForActor(await requireActor(), colekId)
}

/** The assignee (or a desk peer) declines a colek with a reason. */
export async function rejectColekAction(colekId: string, reason: string): Promise<ColekRow> {
  return rejectColekForActor(await requireActor(), colekId, reason)
}

/** Admin reassign a colek to a different user (superadmin or komite-admin desk). */
export async function reassignColekAction(colekId: string, newUserId: string, reason: string): Promise<ColekRow> {
  return reassignColekForActor(await requireActor(), colekId, newUserId, reason)
}

/** Read an application's coleks (gated to participants) — the per-app colek-status read for the UI. */
export async function listColeksForAppAction(appId: string): Promise<ColekRow[]> {
  return listColeksForAppForActor(await requireActor(), appId)
}
