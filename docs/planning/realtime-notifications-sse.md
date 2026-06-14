# Realtime notifications via SSE backed by Postgres `LISTEN/NOTIFY`

> Status: DEFERRED (V1 = polling; realtime built later)
> Owner: App
> Last reviewed: 2026.05.25
> Source of truth for: realtime notification implementation plan

**Status:** DEFERRED (2026.06.04) — **V1 keeps the current polling/derived notifications**; this SSE +
`LISTEN/NOTIFY` design stays the agreed approach for when realtime is picked up. Design agreed 2026.05.25;
handoff brief for the next agent.
**Owner when picked up:** app-side. **Shared surface:** notification IA — decide event
categories/shape with the human before changing them (touches the notification UI contract).

## Why this, not Firebase
We use **only Firebase Auth** — no Firestore/RTDB/FCM. App data is **Postgres** and the deployment
is **on-prem Docker** (a long-lived Node process, NOT serverless). So realtime stays on our stack:
Postgres is the single source of truth → `NOTIFY` on write → a persistent listener fans out → **SSE**
(server→client, one-way, exactly what notifications need). Pulling in a Firebase realtime product would
add a second datastore + bank-data egress to Google, contradicting the on-prem/compliance posture. Don't.

WebSockets are overkill (we don't need client→server). FCM is a different thing (OS push when the app is
closed) and is out of scope here.

## Current state (what exists today)
Notifications are **derived, not stored** — there is no feed table:
- `src/lib/notifications.ts` — `buildNotifications(apps)` computes SLA/docs/OCR alerts on the fly;
  `unreadCount(apps)` for the badge; `sortNotifications()` triage order. **Single source of truth.**
- `src/app/(app)/notifications/page.tsx` — server component: `listApplications()` → `buildNotifications`
  → `sortNotifications` → `<NotificationsList>`.
- `src/app/(app)/layout.tsx` — `notifCount = unreadCount(await listApplications())` → `<AppShell notifCount>`
  → sidebar Bell badge (`components/layout/AppSidebar.tsx`).
- So today notifications refresh ONLY on navigation / full render. No push, no poll.

This means realtime needs **no new data model** — the wire signal can be "something changed, re-derive",
and the existing server-render path produces the fresh state. Keep that leverage.

## Target architecture
```
write (saveApplication) ──pg_notify('mizan_events', {appId})──▶ Postgres
                                                                   │ broadcast
   persistent pg.Client LISTEN mizan_events ◀──────────────────────┘  (one per web replica)
                │ in-process fan-out (EventEmitter)
   GET /api/notifications/stream (SSE, authed) ──data: {"type":"changed"}──▶ EventSource (client)
                                                                                 │
                                                            router.refresh() → server components re-render
```
Wire signal is **"changed"**, not the payload — the client just calls `router.refresh()` and the existing
SSR path recomputes notifications. Less PII on the wire, reuses all current logic. (Richer per-event
payloads = a later optimization, not MVP.)

## Tasks (file by file)

### 1. Persistent listener — `src/server/realtime/pg-listener.ts` (NEW)
- A **dedicated long-lived `pg.Client`** (the `pg` dep is already installed), NOT Prisma's pool —
  Prisma's adapter rotates pooled connections and does not expose `LISTEN`. The listener needs ONE
  connection that stays put and runs `LISTEN mizan_events`.
- Singleton via the `globalThis` pattern (mirror `server/db.ts`) so Next dev HMR doesn't open a new
  connection every reload (connection leak).
- `client.on('notification', msg => emitter.emit('event', JSON.parse(msg.payload)))`.
- Export `subscribe(cb): () => void` (returns an unsubscribe) over a module `EventEmitter`.
- **Reconnect:** on `client.on('error')` / `end`, backoff-reconnect and re-issue `LISTEN`
  (reuse `server/retry.ts` ideas; a NOTIFY emitted while disconnected is LOST — acceptable, see Gotchas).
- Reuse `DATABASE_URL`. Lazy-init on first `subscribe()` (don't connect at import — keep `next build` clean,
  like the lazy Firebase admin / s3 singletons).

### 2. Emit on write — `src/server/repo/write.ts`
- After the mutation commits, emit `SELECT pg_notify('mizan_events', $payload)` for state that changes
  notifications: at minimum `saveApplication` (stage move, SLA, doc/OCR changes). Payload = small JSON
  `{ appId }` (NOTIFY payload cap ≈ 8000 bytes — never dump the aggregate).
- **Transaction nuance (get this right):** Postgres queues NOTIFY and delivers it **on COMMIT**. So calling
  `pg_notify` *inside* the same Prisma transaction is correct and atomic — it fires iff the tx commits, and
  not on rollback. Prefer that over a post-commit call (no lost-on-crash-after-commit gap).
- Consider a tiny helper `emitAppChanged(tx, appId)` so every write path is one line and consistent.

### 3. SSE route — `src/app/api/notifications/stream/route.ts` (NEW)
- **AUTH GATE FIRST** — `verifySession()`; 401 if null. NEVER ship an `/api` route unauthenticated
  (see `apps/web-app/AGENTS.md` API & Security; the docs/* unauth leak is the cautionary tale). Reads are
  `verifySession`-only, which fits.
- Return a `ReadableStream` with headers: `Content-Type: text/event-stream`,
  `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- On open: send an initial `data: {"type":"changed"}` so a (re)connecting client catches up immediately
  (covers events missed while disconnected — see Gotchas).
- `subscribe()` to the listener; for each event relevant to this actor, `enqueue` an SSE frame.
  (MVP: forward every "changed" — refine to per-actor relevance later. The actor's desks/role decide which
  apps matter; reuse `canParticipate` / desk logic, don't re-derive ad hoc.)
- **Heartbeat:** enqueue a `: ping\n\n` comment every ~25s so proxies/Caddy don't drop an idle stream.
- **Cleanup:** on `req.signal` `abort`, call the unsubscribe + `controller.close()` + clear the heartbeat
  interval. Leaks here = held connections.
- Consider a per-actor concurrent-stream cap (a tab-spammer shouldn't exhaust connections); `server/log.ts`
  for open/close (ids only, NEVER PII).

### 4. Client island — `src/components/notifications/NotificationsLive.tsx` (NEW)
- `'use client'`, mounted once in `app/(app)/layout.tsx` (or AppShell). Opens
  `new EventSource('/api/notifications/stream')`; on message → `router.refresh()` (re-renders the server
  components → badge + page update with fresh derived notifications). EventSource auto-reconnects.
- Close on unmount. Graceful degradation: if it errors/unsupported, the app still works (manual refresh /
  navigation) — realtime is an enhancement, not a dependency.

### 5. Deploy / infra — `docs/guides/deployment.md` + compose/Caddy
- **Caddy:** disable buffering for the stream path (e.g. `reverse_proxy` with `flush_interval -1`) and ensure
  no read timeout cuts long-lived SSE. Document the exact directive.
- **Connection budget:** each web replica holds `DATABASE_POOL_MAX` (default 10) **+ 1** persistent listener.
   Keep `Σ ≤ Postgres max_connections`. Note in `docs/guides/deployment.md`.
- **Scaling:** N replicas each `LISTEN` independently — Postgres broadcasts NOTIFY to all, so fan-out is
  correct without a message broker. No Redis needed at this scale.

## Gotchas (don't relearn the hard way)
- **Prisma can't `LISTEN`.** Use a raw `pg.Client`. (Emitting NOTIFY via Prisma `$executeRaw`/inside the tx
  is fine; only the long-lived *listen* needs raw pg.)
- **NOTIFY is fire-and-forget, not durable.** An event emitted while a client is disconnected is gone. Mitigate
  by sending a "changed" on every (re)connect so the client always re-derives full current state — never rely
  on having received every individual event.
- **HMR connection leak.** Singleton the listener via `globalThis` or dev reloads stack up Postgres connections.
- **Same database.** Emit and listen must target the same Postgres instance/DB (they do — one `DATABASE_URL`).
- **Serverless would break this.** It works because on-prem Docker runs a persistent process. If a future
  deploy target is serverless, this design needs an external pub/sub instead — flag it then.
- **PII:** the SSE channel is authed, but keep the wire signal payload-free (`{type:"changed"}` / `{appId}`),
  and NEVER log `nasabahName` (ids + outcomes only — `server/log.ts` rule).

## Phasing
1. **MVP (prove the loop):** listener singleton + `pg_notify` in `saveApplication` + authed SSE route
   (signal-only) + client `EventSource → router.refresh`. Verify: open `/notifications` in tab A, move a stage
   in tab B → tab A updates without manual refresh.
2. **Harden:** per-actor relevance filtering, heartbeat + Caddy config, reconnect/backoff, connection-budget
   doc, per-actor stream cap.
3. **Optional:** richer per-event payloads / multiple channels, metrics on open streams.

## Acceptance
- A relevant write in one session pushes an update to another logged-in session **without a manual refresh**,
  in < ~2s, with no new polling.
- SSE route returns 401 unauthenticated; streams only after `verifySession`.
- No connection leak: opening/closing many tabs returns Postgres connection count to baseline.
- Production unaffected when feature is off; degrades gracefully if EventSource fails.
- `pnpm typecheck` + `pnpm lint` green; a manual two-session smoke documented.

## Anchors (current code)
- Derive logic / badge: `src/lib/notifications.ts` (`buildNotifications`, `unreadCount`, `sortNotifications`).
- Page: `src/app/(app)/notifications/page.tsx`. Layout badge: `src/app/(app)/layout.tsx` → `AppShell` → `AppSidebar`.
- DB singleton + pool config: `src/server/db.ts` (Prisma 7 + `@prisma/adapter-pg`; `pg` dep present).
- Write seam (where NOTIFY goes): `src/server/repo/write.ts` (`saveApplication`).
- Auth gate for the route: `src/server/auth/session.ts` (`verifySession`). Retry/backoff: `src/server/retry.ts`.
- Logging: `src/server/log.ts`.
