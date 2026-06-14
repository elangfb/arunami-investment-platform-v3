# Mizan — On-Prem Deployment (Docker)

> Status: Current
> Last reviewed: 2026.05.25
> Source of truth for: on-prem Docker deployment and restore operations

The production target is **on-prem Docker Compose** on a single host. Everything runs on
an internal network; only the reverse proxy (Caddy) is published.

## Stack

| Service | Image | Role |
|---------|-------|------|
| `caddy` | `caddy:2-alpine` | TLS terminator + reverse proxy (only public service) |
| `web` | built from `Dockerfile` (`runner`) | Next standalone server |
| `migrate` | built from `Dockerfile` (`builder`) | one-shot `migrate deploy` → `seed:config` (factory defaults), then exits |
| `postgres` | `postgres:17-alpine` | application database (named volume) |
| `seaweedfs` | `chrislusf/seaweedfs:4.28` | document object storage (named volume) |
| `searxng` | `searxng/searxng:latest` | self-hosted search for the research provider (localhost-bound) |
| `firecrawl` | `firecrawl/firecrawl:latest` | self-hosted page scrape/extract for the research provider (localhost-bound) |

Image design (`Dockerfile`): `deps` → `builder` (`prisma generate` + `next build`,
`output: 'standalone'`) → `runner` (minimal). Prisma 7 here is **Rust-free** (the
`query_compiler` wasm + the `pg` driver adapter), so the runtime needs **no native query
engine**; the native schema engine is only used by the `migrate` service.

## First deploy

```bash
cp .env.production.example .env      # compose reads `.env` for ${...} AND as env_file
$EDITOR .env                        # fill every CHANGE_ME / blank (see notes below)
$EDITOR docker/seaweedfs/s3.json    # set access/secret keys to match S3_* in .env

docker compose -f compose.shared.yaml -f compose.build.yaml up -d --build
```

Order is enforced: `postgres` (healthy) → `migrate` (applies migrations, exits 0) →
`web`; `caddy` fronts `web`. Verify:

```bash
docker compose -f compose.shared.yaml -f compose.build.yaml ps # migrate = exited(0), rest = up
curl -kI https://localhost/                          # 200/307 from caddy → web
```

## GHCR image deploys (dev/staging)

Use `compose.shared.yaml` + `compose.ghcr.yaml` when a server should pull images built by GitHub Actions instead of
building locally. The workflow publishes two images from the same Dockerfile:

- `ghcr.io/<owner>/mizan-web:<tag>` (`runner` target)
- `ghcr.io/<owner>/mizan-migrate:<tag>` (`builder` target; includes Prisma CLI + seed tooling)

Required GitHub repository variables for the image build: all Firebase `NEXT_PUBLIC_*` values.
They are build-time values and changing them requires rebuilding/publishing images.

Server setup:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
cp .env.production.example .env
$EDITOR .env # set GHCR_IMAGE_PREFIX=ghcr.io/<owner>, IMAGE_TAG=main or a commit SHA
```

Deploy/update with migration ordering preserved:

```bash
./scripts/deploy-ghcr.sh             # uses IMAGE_TAG from .env, defaults to main
./scripts/deploy-ghcr.sh <commit-sha> # immutable rollback/roll-forward
```

Do not use blind container auto-update for this app unless it preserves `pull → migrate → web`
ordering. A timer/cron around `scripts/deploy-ghcr.sh` is safer than Watchtower for dev/staging.

## Auto-deploy (pull-based systemd timer — dev/staging)

The full pipeline is **push to `main` → CI (`verify`) → GHCR publish (`mizan-web:main` +
`mizan-migrate:main`) → dev host pulls & deploys**. The publish half runs in GitHub Actions
(`.github/workflows/ci.yml` → `ghcr.yml`). The deploy half is a pull-based timer on the host:
it polls GHCR and runs `scripts/deploy-ghcr.sh`, which re-deploys **only when the image digest
changed** (a no-op otherwise), preserving `migrate → web → caddy` ordering. Pull-based means the
host needs **no inbound access** — it works behind NAT/firewall, unlike a push-from-Actions SSH.

It installs as a **systemd user service** (`systemctl --user`) — it runs as your normal login
user, **no root/sudo**. Prereq: that user must reach Docker without sudo (be in the `docker`
group, or use rootless Docker) and have run `docker login ghcr.io`.

One-time host setup (after the [GHCR image deploys](#ghcr-image-deploys-devstaging) steps and a
first successful `./scripts/deploy-ghcr.sh`), all as your normal user:

```bash
docker login ghcr.io -u <github-user>   # creds for this user (no sudo)
./scripts/install-autodeploy.sh         # installs to ~/.config/systemd/user, polls every 3min
# Variants:
MIZAN_DIR=/srv/mizan INTERVAL=5min ./scripts/install-autodeploy.sh
```

Units live in `ops/systemd/` (`mizan-deploy.{service,timer}`); the installer substitutes the repo
path/interval into `~/.config/systemd/user/` and enables the timer. It also enables **linger**
(`loginctl enable-linger`) so the timer runs even when you are not logged in — needed on a
headless host. If self-linger is denied, the installer prints the one `sudo loginctl enable-linger`
line to run. Operate it (no sudo):

```bash
systemctl --user start mizan-deploy.service       # deploy now, don't wait for the tick
journalctl --user -u mizan-deploy.service -f      # watch a deploy run
systemctl --user list-timers mizan-deploy.timer   # next scheduled run
systemctl --user disable --now mizan-deploy.timer # pause auto-deploy
```

Scope: the timer only pulls **images** and redeploys. Changes to compose files, `scripts/`, or
`.env` are NOT auto-applied — `git pull` (or edit `.env`) on the host for those, by design, so a
bad infra change can't silently auto-ship. Pin `IMAGE_TAG` to a commit SHA in `.env` to freeze a
dev host on a known build; leave it `main` to track the branch.

## Secrets & gotchas

- **Rotate everything** in `.env` and `docker/seaweedfs/s3.json` before a real deploy — the
  examples are placeholders. `.env` and `.env.production` are git- and docker-ignored.
- **Do not bake secrets into image layers.** Runtime secrets belong in `.env`/`env_file`; rotate dev Gemini, Firebase, Google OAuth, and S3 credentials before go-live.
- **Docker build:** pnpm's build-script gate must stay non-interactive. Install with
  `--ignore-scripts`, explicitly rebuild trusted native packages, and call binaries through
  `node_modules/.bin/...` rather than `pnpm exec`.
- **`NEXT_PUBLIC_*` are baked at BUILD time** (passed as compose `build.args`). Changing the
  Firebase client config requires a rebuild: `up -d --build`. All other vars are runtime.
- **Secret readers:** keep server-side secret singletons lazy (`getAdminAuth()`, `s3()`, Prisma)
  so `next build` page-data collection does not require runtime secrets.
- **Database fail-fast:** keep `connectionTimeoutMillis` and `DATABASE_POOL_MAX` configured so an unreachable Postgres fails health checks/requests quickly instead of hanging the process.
- **Security headers:** Caddy ships baseline response headers. CSP is intentionally deferred until Firebase Auth, Google APIs, and Docs `/preview` iframe allowlists are validated through real-login E2E.
- **Outbound egress:** Google Docs/Drive + Gemini + Firebase Auth require the host to reach
  the internet. This is the open **bank-egress gate** — if the bank forbids on-prem→internet,
  that whole integration needs rework. Document storage + the core pipeline do NOT need egress.
- **Research stack:** `searxng` + `firecrawl` run as part of `compose.shared.yaml`, but the app
  uses them only when `WEB_RESEARCH_PROVIDER=searxng-firecrawl` and `RESEARCH_WORKER_ENABLED=1`.
  Set a real `SEARXNG_SECRET`; research egresses to public search/pages when enabled.
- **Seed:** the `migrate` service runs `migrate deploy` then **`seed:config`** (= `seed.ts
  --config-only`): factory defaults only — desk catalog, role bundles, and each config table's v1
  baseline. It injects NO demo data (`seed-dummy` refuses `NODE_ENV=production`), so real
  customer data is never polluted. Without this prod would have no desk/role catalog. Provision
  real **users** via Google login + desk grants in the `/admin` console (not seeded).
- **TLS:** `DOMAIN=localhost` → Caddy local cert (LAN). A real FQDN → auto-HTTPS (needs 80/443
  reachable + DNS) or mount the bank's own cert in `docker/Caddyfile`.

## Backups (Tier 2.4 — OJK retention)

`scripts/backup.sh` dumps Postgres (`pg_dump`, consistent) + archives the SeaweedFS volume:

```bash
./scripts/backup.sh                              # → ./backups (keeps newest 14 sets)
BACKUP_DIR=/mnt/nas/mizan KEEP=30 ./scripts/backup.sh
# schedule, e.g. nightly at 02:00:
# 0 2 * * *  cd /opt/mizan && BACKUP_DIR=/mnt/nas/mizan ./scripts/backup.sh >> /var/log/mizan-backup.log 2>&1
```

Restore (DESTRUCTIVE, stack up): `./scripts/restore.sh backups/pg-<TS>.sql.gz backups/seaweed-<TS>.tar.gz`.

**Operational decisions you must make:** the backup *destination* (point `$BACKUP_DIR` at a NAS /
offsite target — local disk alone is not a backup), the *retention* window (`KEEP`, per your OJK
policy), and *off-host replication*. After restore, document integrity is checkable: the SHA-256
stored in Postgres must match the restored object bytes.

## Build verification status

Verified on the dev host:
- `docker build` → **288 MB** image (`runner` target), EXIT 0.
- Container boots and serves: `/`→307→`/login`, `/login`→200, authed doc route→**401**.
- **Prisma wasm loads + connects + queries inside the image** (`application.count()` returned 37) —
  confirms output-file-tracing + the wasm copy produced a working Rust-free Prisma in the bundle.
- `docker compose -f compose.shared.yaml -f compose.build.yaml config` validates the local-build stack.

Remaining acceptance step (needs real secrets/host): a full `docker compose up` on a clean host —
migrate → web → TLS → real Google login → upload a doc → survive `docker compose restart`. This
doubles as the first real-login surface (Tier 1.1).
