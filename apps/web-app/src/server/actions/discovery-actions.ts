'use server'

import { requireActor } from '@/server/auth/session'
import {
  runDiscoveryForActor,
  linkDriveFolderForActor,
  scaffoldDriveFolderForActor,
  listSourceManifestForActor,
  type DiscoveryTarget,
  type DiscoveryStatus,
  type ManifestRow,
} from './discovery-actions.core'

// Thin 'use server' wrappers for the document-discovery UI (DocumentDiscoveryPanel). Each resolves the
// real actor (requireActor) then delegates to the actor-injected core (discovery-actions.core.ts), which
// holds the gate + logic and is itest-able with a test Actor. The core is server-only and NOT a server
// action, so the actor-trusting entry points are never exposed over the wire. See the core for the full
// design contract (discovery state off the aggregate; folder refs via direct prisma; content-free).

export type { DiscoveryTarget, DiscoveryStatus, ManifestRow } from './discovery-actions.core'

/** Run a discovery scan + report linked-folder flags. */
export async function runDiscoveryAction(appId: string): Promise<DiscoveryStatus> {
  return runDiscoveryForActor(await requireActor(), appId)
}

/** Link a Drive folder to a scope (RM intake-gated), then re-scan. */
export async function linkDriveFolderAction(appId: string, target: DiscoveryTarget, input: string): Promise<DiscoveryStatus> {
  return linkDriveFolderForActor(await requireActor(), appId, target, input)
}

/** Scaffold the standard sub-folder structure inside a linked folder (best-effort, RM intake-gated). */
export async function scaffoldDriveFolderAction(appId: string, target: DiscoveryTarget): Promise<{ created: string[]; warning?: string }> {
  return scaffoldDriveFolderForActor(await requireActor(), appId, target)
}

/** List the source-doc manifest ledger for both scopes (Riwayat). */
export async function listSourceManifestAction(appId: string): Promise<{ nasabah: ManifestRow[]; app: ManifestRow[] }> {
  return listSourceManifestForActor(await requireActor(), appId)
}
