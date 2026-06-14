# ADR-0012: Grant-based stage auto-assignment (Wave 2 home)

- **Status:** accepted
- **Date:** 2026.06.07

## Context

The Home (Beranda Saya) is a Kanban (kept deliberately — Jira-familiar) that shows a user the applications **assigned to them**, grouped by personal status. For that to answer "which apps are mine?", an app must be auto-assigned to the right user when it enters a stage they own.

Auto-assignment already existed in the engine: `applyDecision` opens a `StageAssignment` for each `ownersForStage(stage)` on stage entry, and app-creation assigns the creating RM. But `ownersForStage` resolved owners from the **static seed `USERS` + `DEFAULT_ROLES`** — so it worked for seed users yet **missed any user created or desk-granted via the admin console**. Their Home stayed empty even though they hold the owning desk. The user asked for auto-assignment "based on role/desk permissions, simplest common strategy first."

## Decision

Resolve stage owners from **real effective desk grants** (role grants ∪ direct grants), not the seed.

1. **Pure resolver** `ownersFromUsers(users, stage)` (`lib/stage-owners.ts`): returns one `StageOwner {id,name,role}` per user holding a desk that owns the stage (`DESK_FOR_STAGE`), role from `ROLE_OF_DESK`. **Strategy = assign to all real holders of the owning desk** (the simplest common strategy; matches the prior seed cardinality, no balancing state).
2. **Server resolver** `stageOwnerResolver()` (`server/auth/stage-owners.ts`): loads `listUsers()` (live effective desks) once and returns a sync `(stage) => StageOwner[]`.
3. **Injection, engine stays pure:** `dispatch(app, command, actor, reason, resolveOwners?)` → `applyDecision(..., owners?)` uses the injected owners, falling back to the seed `ownersForStage` when none supplied (tests / seed). Every transition action passes `await stageOwnerResolver()` — wired into all seven dispatch sites (transition, dual-handoff 2→3, MUAP/RSK ladder→4, Komite→5/6, conditional-accept→6, revise-regress→3).
4. **App-creation unchanged:** the creating RM is assigned the new Stage-1 app (they own it).
5. **Home Kanban kept** (no UI reshape) — the familiar 3-column board now populates per real user.

## Consequences

- Any user holding a stage-owning desk — **including admin-granted users, not just seed** — lands the app on their Home Kanban the moment it enters a stage they own.
- The pure engine is unchanged in spirit (owners injected as data; seed fallback preserves every existing unit/integration test).
- One `listUsers()` read per transition (small team; transitions infrequent). Acceptable; revisit if it ever shows up.
- **Deferred (backlog):** single-owner load-balancing (round-robin / least-loaded) if "assign to all holders" proves noisy; PersonalKanban drag-persistence (separate ADR-0011 backlog item).
- Verified: typecheck · lint 0-err · 351 unit (incl. `stage-owners.test.ts`) · 42 integration · 21 e2e (136 steps) · live: a real Legal user's Home shows their assigned Stage-2 apps in the kept Kanban.
