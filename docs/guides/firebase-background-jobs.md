# Background jobs on Firebase (App Hosting)

Status: **P3d of the Firestore migration.** The job *logic* for both background jobs is backend-aware
and emulator-verified (`materialize.fs.itest.ts`, `job.fs.itest.ts`). This guide covers the **trigger /
deployment topology** — the part that only exists once the app runs on Firebase App Hosting.

The platform has two background jobs. App Hosting is Cloud Run, which **scales to zero**, so neither
an in-process timer nor the old pg-boss/Postgres scheduler survives. Each gets a Firebase-native
trigger instead.

---

## 1. Meeting materializer — Cloud Scheduler → in-app endpoint ✅ built

A quick daily pass that auto-creates `proposed` committee meetings. It runs as a normal authenticated
endpoint in the Next app, hit on a schedule by **Google Cloud Scheduler**.

- **Endpoint:** `POST /api/cron/materialize-meetings` ([route](../../apps/web-app/src/app/api/cron/materialize-meetings/route.ts))
  - Optional `?daysAhead=N` (default 14, capped at 60).
  - Idempotent — a re-run skips already-materialized `(template, scheduledDate)` slots, so Scheduler
    retries are safe.
- **Auth:** machine-to-machine via the shared `CRON_SECRET` env var, sent as `Authorization: Bearer
  <secret>` (or `X-Cron-Secret`). [Fail-closed](../../apps/web-app/src/server/auth/cron.ts): if
  `CRON_SECRET` is unset the endpoint rejects every request, so a misconfigured deploy can never run
  the trigger open.
- **Admins** keep the in-app manual trigger (`runMeetingMaterializerAction`, ADMIN-MASTER) for
  on-demand runs / recovery.

### Deploy wiring

1. Set `CRON_SECRET` (a long random string) in App Hosting secrets / Secret Manager.
2. Create the Cloud Scheduler job (daily, Asia/Jakarta):

   ```bash
   gcloud scheduler jobs create http materialize-meetings \
     --schedule="0 2 * * *" \
     --time-zone="Asia/Jakarta" \
     --uri="https://<app-hosting-domain>/api/cron/materialize-meetings" \
     --http-method=POST \
     --headers="Authorization=Bearer ${CRON_SECRET}"
   ```

   (Or use an OIDC service-account token instead of the shared secret and extend
   `isCronAuthorized` to verify it — the shared secret is the simplest correct default.)

---

## 2. Research worker — separate long-running compute ⏳ deploy-time

The research agent runs an autonomous loop with a budget of **up to 6 hours** per job
(`RESEARCH_BUDGET.MAX_WALL_CLOCK_MS`). That **cannot** run inside an HTTP request (Cloud Run request
timeouts are far shorter), so — unlike the materializer — it needs its own always-available compute.
It is **opt-in** (`RESEARCH_WORKER_ENABLED=1`) and not enabled by default.

The data layer is done: `enqueueResearchJob`, `claimQueuedJob` (transactional compare-and-set),
`listQueuedJobIds`, `finalizeJob`, `recordStep`, etc. are all backend-aware
([job.ts](../../apps/web-app/src/server/research/job.ts) dispatcher →
[job.firestore.ts](../../apps/web-app/src/server/research/job.firestore.ts)). What remains is the
runner host, to be wired against the real GCP project:

- **Recommended:** a **Cloud Run job/service** (or 2nd-gen Cloud Function) that imports the existing
  `bootResearchSubsystem()` / worker tick + `runResearchJob`, claims `queued` jobs from Firestore, and
  runs each to completion. Min-instances ≥ 1 (so the poller isn't killed by scale-to-zero) **or**
  trigger it from Cloud Scheduler / Cloud Tasks every few minutes to drain the queue.
- **Restart-safety** already exists: `markStaleRunningAsFailedRestart()` flips jobs left `running` by a
  dead process to `failed-restart` on boot so analysts can re-queue.
- **Enqueue** stays in the Next app (`enqueueResearchJobAction`); only the *runner* moves out.

This piece is intentionally deferred to staging deploy (P4/P5), where it can actually be deployed and
tested against real Firestore + Cloud Run rather than shipped as untested scaffolding.

---

## Env vars summary

| Var | Used by | Notes |
|---|---|---|
| `CRON_SECRET` | `/api/cron/*` | Shared secret for Cloud Scheduler. **Required** for the materializer trigger to run (fail-closed). |
| `RESEARCH_WORKER_ENABLED` | research worker | `1` to start the poller; unset = disabled (default). |
| `RESEARCH_AGENT_MODE` | research worker | `poc` for the single-sub-Q POC runner; anything else = production. |
