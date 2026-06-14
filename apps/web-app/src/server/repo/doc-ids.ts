// Deterministic Firestore document-id helpers — PURE (no I/O), unit-tested (doc-ids.test.ts).
// Used by BOTH the write impls (to mint ids) and the integration assertions (to address docs).
// The deterministic-id scheme is how Firestore enforces the relational uniqueness constraints
// (one-vote-per-member, append-only history seq, qrToken, config version) that Postgres did with
// UNIQUE indexes: the doc-id IS the key, and a duplicate `tx.create` collides and throws.
//
// NOTE: this module is backend-agnostic string math only — no 'server-only', so the doc-ids
// unit test and (later) the backfill script can import it under tsx without the server guard.

/** Zero-pad a monotonic seq to 7 digits so lexical doc-id order == numeric order. */
export function pad7(n: number): string {
  return String(n).padStart(7, '0')
}

/** applications/{appId}/history/{docId} — docId = padded per-app seq (a duplicate create = the
 *  append-only backstop). The history row's `id` FIELD is SEPARATE (see historyId) — never derive
 *  the stored `id` from this on the create/save paths; use the incoming entry's own id there. */
export function historyDocId(seq: number): string {
  return pad7(seq)
}

/** The history row's `id` FIELD value minted by the append paths (appendApprovalStep /
 *  appendConversationMessages audit). Matches the Prisma scheme `h-<pad7(seq)>-<appId>`. */
export function historyId(seq: number, appId: string): string {
  return `h-${pad7(seq)}-${appId}`
}

/** applications/{appId}/conversation/{docId} — surface-scoped 0-based seq (per-(app,surface)). */
export function conversationDocId(surface: string, seq: number): string {
  return `${surface}__${pad7(seq)}`
}

/** applications/{appId}/approvalSteps/{docId} — padded per-app monotonic seq so the read-back
 *  order (docId asc) reproduces the Prisma `[createdAt asc, id asc]` total order the chain reducer needs. */
export function approvalStepDocId(seq: number): string {
  return pad7(seq)
}

/** applications/{appId}/assignments/{docId}. (stage,userId,assignedAt-ms) is NOT guaranteed unique
 *  (a re-assign of the same user to the same stage in the same ms collides), so a per-save array
 *  INDEX suffix guarantees no two assignments in one rebuilt set share a docId (critique #30). */
export function assignmentDocId(stage: number, userId: string, assignedAt: Date, index: number): string {
  return `${stage}__${userId}__${assignedAt.getTime()}__${index}`
}

/** Replace anything outside [A-Za-z0-9_-] with '_' so a value is a legal Firestore doc-id segment. */
function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_')
}

/** sourceManifest/{docId}. Content-addressed within a scope (app|customer): same (scope,docType,
 *  sha256) is the SAME doc → a re-scan of unchanged bytes is a create-collision = deduped. */
export function manifestDocId(
  scope: { applicationId: string } | { customerId: string },
  docType: string,
  sha256: string,
): string {
  const scopeKey = 'applicationId' in scope ? `app_${scope.applicationId}` : `cust_${scope.customerId}`
  return `${slug(scopeKey)}__${slug(docType)}__${sha256}`
}

/** index_meetingTemplateSlot/{docId} — the materializer idempotency key (templateId, calendar date). */
export function meetingTemplateSlotId(templateId: string, scheduledDate: Date): string {
  return `${slug(templateId)}__${scheduledDate.toISOString().slice(0, 10)}`
}

/** docAccessGrant/{docId} — per (Drive docId, email). Composite key enforces one grant per pair. */
export function docAccessGrantId(docId: string, email: string): string {
  return `${slug(docId)}__${slug(email)}`
}

/** driveRootGrants/{docId} — keyed by email (the Prisma @unique alternate key → doc-id = slug(email)). */
export function driveRootGrantId(email: string): string {
  return slug(email)
}

/** config_templateReferenceText/{docId} — per (templateId, tokenName) (the Prisma @@id composite). */
export function templateReferenceTextId(templateId: string, tokenName: string): string {
  return `${slug(templateId)}__${slug(tokenName)}`
}

/** applications/{appId}/documentFills/{docId} — per (docId, tokenName); appId is the parent path, so
 *  this segment enforces the (appId, docId, tokenName) @@unique. */
export function documentFillId(docId: string, tokenName: string): string {
  return `${slug(docId)}__${slug(tokenName)}`
}

/** config_aiPrompt/{docId} — per (promptKey, version). */
export function aiPromptDocId(promptKey: string, version: number): string {
  return `${slug(promptKey)}__${version}`
}

/** config_approvalRouting/{docId} — per (makerUserId, chain, version). */
export function approvalRoutingDocId(makerUserId: string, chain: string, version: number): string {
  return `${slug(makerUserId)}__${slug(chain)}__${version}`
}

/** Versioned config doc-id for the single-keyed configs (docId = the version number). */
export function configVersionDocId(version: number): string {
  return String(version)
}

/** meetings/{docId} — MTG-YYYY-NNN, allocated from the counters/{meetingId-YYYY} doc. */
export function meetingId(year: number, n: number): string {
  return `MTG-${year}-${String(n).padStart(3, '0')}`
}
