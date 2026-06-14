# ADR-0010: Superadmin is workflow-read-only; acts only via impersonation

- **Status:** accepted
- **Date:** 2026.06.06

## Context

A superadmin was full **god-mode on the workflow**: `verifySession` granted it `desks = [...ALL DESKS]` and `isSuperadmin = true`, and several `lib/auth/can.ts` predicates short-circuited on `isSuperadmin` (`canActOnDesk`, `canParticipate`, `effectiveRole`, `actingRolesForStage`, `hasAnyDesk`) plus a komite chair-bypass. So a superadmin could sign a MUAP/RSK ladder rung, set a committee decision, or edit any desk — all attributed in the audit trail to "Superadmin", not to a real role. That is a weak **audit-attribution** + **separation-of-duties** posture for an OJK-regulated origination engine, and it left a latent four-eyes hole.

The least-privilege scaffolding already existed: `ADMIN-USERS/MASTER/POLICY` desks "gate admin-console actions only, never the workflow window… so admin work no longer needs break-glass superadmin" (`lib/desks.ts`). And impersonation already swaps the Actor to the target identity (`isSuperadmin=false`, the target's desks) and stamps every action `"a.n. Superadmin X"`. The only gap was the superadmin flag still carrying pipeline power.

## Decision

A real superadmin (not impersonating) is **workflow-read-only**. It acts on the pipeline **only by impersonating** a real desk/user, which is audited.

1. `server/auth/session.ts` — a superadmin's effective `desks` are `[...ADMIN_DESKS, 'MG']` (admin console + observer view), **never pipeline desks**. (`SUPERADMIN_DESKS`, the single definition.)
2. `lib/auth/can.ts` — the `isSuperadmin` short-circuits are removed from the **workflow** predicates (`canActOnDesk`, `canParticipate`, `effectiveRole`, `actingRolesForStage`, `hasAnyDesk`). `isSuperadmin` remains only for **admin** gates (console access, granting ADMIN-* desks, starting impersonation). Admin asserts pass because the superadmin holds the `ADMIN-*` desks directly.
3. `server/actions/komite.ts` — the superadmin chair-bypass is removed; setting a decision / recording minutes requires being the chair (or impersonating the actual chair **user**, not the `desk:komite` persona).
4. **Impersonation stays superadmin-only** (unchanged): a non-superadmin admin is workflow-read-only with no act path (config is its job). Admins were already read-only — no change for them.
5. UX: a footer **"Akhiri 'Bertindak sebagai…'"** button (above logout, shown while impersonating) complements the sticky `ImpersonationBanner`'s exit.

## Consequences

- Every workflow action is attributed to a **real role**; superadmin self-attributed workflow actions are gone. Break-glass = impersonate the actual desk/user (audited).
- Superadmin keeps **full read/view everywhere** (audit-first, nothing hidden) + all admin powers + the MG observer nav (Komite/Management/Pipeline). It loses direct create/act (no "Aplikasi Baru", no "Tugas Anda" task, no act buttons) until it impersonates.
- `MG` is now part of the superadmin desk set purely for the observer **view**; `MG` grants no write (`canParticipate` excludes it), so this does not re-introduce any action path.
- For a komite decision with no available chair, a superadmin must impersonate the chair **user** (`user:<id>`) — the desk persona alone won't satisfy the chair-id check. This is the intended audit-clean path.
- Verified: typecheck · lint 0-err · 348 unit (incl. `can.test.ts` "superadmin: read-only on the workflow…") · 42 integration · 21 e2e (136 steps) · live: superadmin read-only on a Stage-3 dossier, admin console intact, impersonate→act restores the task band, end-impersonation button restores identity.
