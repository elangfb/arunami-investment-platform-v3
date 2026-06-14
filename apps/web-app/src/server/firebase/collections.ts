import 'server-only'
import type { Firestore, DocumentReference, CollectionReference } from 'firebase-admin/firestore'

// Single source of truth for every Firestore collection / subcollection path, so the repo
// implementations and the tests can never drift on a name. Mirrors the Prisma models 1:1 (see
// the migration plan's data model). Sub-collection names match the composite indexes in
// firestore.indexes.json EXACTLY (esp. 'conversation', used by a collection-group query).

/** Top-level collections. */
export const COL = {
  applications: 'applications',
  customers: 'customers',
  decisionCheckpoints: 'decisionCheckpoints',
  meetings: 'meetings',
  deskAssignments: 'deskAssignments', // COLEK work requests
  sourceManifest: 'sourceManifest',
  users: 'users',
  roles: 'roles',
  deskCatalog: 'deskCatalog',
  counters: 'counters', // counters/{name} — e.g. meetingId-YYYY
  researchJobs: 'researchJobs', // background MUAP research jobs (steps in the 'steps' subcollection)
  // Document-generation / Google-Drive / AI-audit / impersonation subsystem (P2.5).
  docLinkages: 'docLinkages', // docLinkages/{appId} — live MUAP/RSK/MoM/SP3 Doc id hub (1:1 with app)
  docAccessGrant: 'docAccessGrant', // {slug(docId)__slug(email)} — per-doc Drive permission idempotency
  driveRefs: 'driveRefs', // {key} — singleton Drive folder refs (e.g. mizan-root)
  driveRootGrants: 'driveRootGrants', // {slug(email)} — per-email Mizan-root read-grant ledger
  aiInteraction: 'aiInteraction', // append-only audit of masked AI egress
  impersonationAudit: 'impersonationAudit', // append-only superadmin impersonation sessions
  config_templateReferenceText: 'config_templateReferenceText', // {slug(tpl)__slug(token)} — static ref text (V2, dormant)
  // Versioned, effective-dated config (docId = version, or composite key for the per-scope ones).
  config_slaPolicy: 'config_slaPolicy',
  config_riskPolicy: 'config_riskPolicy',
  config_committeeRooms: 'config_committeeRooms',
  config_disbursementConditions: 'config_disbursementConditions',
  config_holidayCalendar: 'config_holidayCalendar',
  config_scheduleTemplate: 'config_scheduleTemplate',
  config_aiPrompt: 'config_aiPrompt', // docId = promptKey__version
  config_approvalRouting: 'config_approvalRouting', // docId = makerUserId__chain__version
} as const

/** Uniqueness-index collections: doc-id IS the unique key; existence = the constraint. */
export const IDX = {
  qrTokens: 'index_qrTokens', // {token} -> { appId, stepId }
  userEmail: 'index_userEmail', // {email} -> { userId }
  userFirebaseUid: 'index_userFirebaseUid', // {uid} -> { userId }
  roleKey: 'index_roleKey', // {key} -> { roleId }
  meetingTemplateSlot: 'index_meetingTemplateSlot', // {templateId__scheduledDate} -> { meetingId }
} as const

/** Subcollections under applications/{appId}. Names are load-bearing (indexes + collection-group). */
export const SUB = {
  documents: 'documents',
  history: 'history',
  assignments: 'assignments',
  komiteVotes: 'komiteVotes',
  conversation: 'conversation',
  approvalSteps: 'approvalSteps',
  documentVersions: 'documentVersions', // immutable MUAP/RSK snapshot ledger (P2.5)
  extractionRuns: 'extractionRuns', // append-only doc extraction run log (P2.5)
  documentFills: 'documentFills', // per-(docId,tokenName) fill ledger / lost-in-doc tracking (P2.5)
} as const

/** Subcollection of researchJobs/{jobId} — per-step OJK audit rows (kept separate from SUB, which
 *  is scoped to applications/{appId}). */
export const RESEARCH_STEPS_SUB = 'steps'

export type SubName = (typeof SUB)[keyof typeof SUB]

/** The applications/{appId} root document ref. */
export function appRef(db: Firestore, appId: string): DocumentReference {
  return db.collection(COL.applications).doc(appId)
}

/** A subcollection of applications/{appId} (e.g. SUB.history). */
export function subCol(db: Firestore, appId: string, sub: SubName): CollectionReference {
  return appRef(db, appId).collection(sub)
}
