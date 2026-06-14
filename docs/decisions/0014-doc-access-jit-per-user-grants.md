# ADR-0014: Google Doc access is just-in-time per-user, follows the browser identity

- **Status:** accepted
- **Date:** 2026.06.08
- **Superseded in part (2026.06.10) by [ADR-0016](0016-per-stage-doc-lifecycle-one-editable.md):** the
  "upgrade-only, never downgrade, live Docs stay editable after approval" stance is **reversed** — ADR-0016
  ratifies **downgrade-on-advance** (writer→reader when a doc's authoring stage passes) + **exactly-one-editable-document**
  (`canEditDoc` exact-stage). The JIT per-email grant mechanism below stands; only the never-downgrade clause is amended.
- **Further relaxation slated (2026.06.11) by [rm-led-pipeline-redesign](../designs/rm-led-pipeline-redesign.md):** under
  open-read access, **broad folder-share supersedes the per-email JIT grant model**, and generated docs move to Mizan-owned
  Drive + a shortcut into the user folder. The superseding ADR **[ADR-0019](0019-open-read-scoped-write-access.md)
  shipped and merged to `main` 2026.06.12** — this ADR is now **superseded**; build against ADR-0019 +
  [`../CURRENT-STATE.md`](../CURRENT-STATE.md).

## Context

Every per-application MUAP/RSK Google Doc is **owned by the dedicated Mizan Google
account** and created via `files.copy` (ADR-0006, `docs/guides/google-docs-oauth.md`).
A Drive copy does **not** inherit the master's sharing, so each per-app Doc starts
**private to the Mizan account**. No human is logged into that account in a browser, so
the embedded `/preview` iframe and the "Buka di Google Docs" (`/edit`) link both hit
Google's **"request access"** wall for *every* real user — including the RM who is
supposed to draft the MUAP. The reported symptom: a coworker had to request access just
to draft a MUAP they own.

Two constraints shaped the fix:
- The Docs carry **customer PII** (names, NIK, SLIK creditor data), so the cheap fix —
  "anyone with the link can edit" — is unacceptable: a leaked link would expose PII.
- A **superadmin acts only by impersonation** (ADR-0010). When impersonating, the
  workflow audit attributes the impersonated desk, but the Google login that actually
  opens the Doc in the browser is the **superadmin's own** — so naively sharing to the
  acting identity would share to a synthetic `desk:<name>` persona that has no email.

## Decision

When a user loads an application's doc panel, the server **grants that human the correct
Drive permission just-in-time**, per-email (`type=user`), never link-shared.

1. **One predicate, two consumers** — `lib/auth/doc-access.ts` `driveRoleForDoc(actor,
   app, kind)` returns `writer` (the maker — `muap-author` ≤ Stage 3 / `rsk-author`
   ≤ Stage 4 until submitted), `reader` (author + downstream + maker-checker approvers),
   or `null`. The UI tabs (`MUAPTab`/`RSKTab`) and the grant both call it, so the in-app
   affordance and the Google Drive access can never drift.
2. **Follow the browser identity** — the grant goes to the **human operating the
   session**: `actor.impersonating?.realSuperadminId ?? actor.userId` → that user's login
   email. So an impersonating superadmin is shared the Doc under their *own* email (the
   one their browser is signed into), while the writer/reader **decision** is still made
   from the impersonated desks. Email-less identities (seeded demo actors) are skipped.
3. **Persisted, idempotent, upgrade-only** — `DocAccessGrant` (`@@unique([docId,
   email])`) records every grant: the idempotency guard (skip the Drive round-trip when a
   sufficient grant exists), the audit record of who can reach a PII Doc, and the handle
   for a future revoke. Grants **upgrade** (reader→writer) but never auto-downgrade (live
   Docs stay editable after approval, per the engine).
4. **Single trigger** — the doc panel's existing `GET /api/applications/:id/docs` (hit on
   mount) calls `ensureDocAccessForActor` best-effort, so access is in place before the
   iframe renders and no extra client round-trip is added. A grant failure never fails the
   doc read.

## Consequences

- A participant opens the MUAP/RSK tab and the preview just renders; the maker clicks
  "Buka di Google Docs" and can edit — no request-access wall, no manual sharing.
- PII stays protected: access is always a named per-email grant, auditable in
  `DocAccessGrant`, never a public link.
- Impersonation is audit-clean on **both** axes: the workflow action is attributed to the
  impersonated desk (ADR-0010), and the Drive grant is attributed to the real superadmin.
- Revocation/downgrade on stage exit is **not** automated (out of scope; the engine keeps
  live Docs editable). `DocAccessGrant.permissionId` is retained so a future sweep can.
- `stubDriveClient` gained `permissions.create`; tests assert the ledger, not Google.
- Verified: typecheck · lint 0-err · 378 unit (incl. `doc-access.test.ts`) · 47
  integration (incl. `docs/access.itest.ts`: role/idempotency/upgrade/no-downgrade,
  email-less skip, and impersonation→superadmin-email).
