#!/usr/bin/env bash
# E2E harness. Orchestrates the moving parts the Cucumber suite needs, for EITHER backend:
#   prisma   (default): Postgres mizan_e2e DB (guarded) + Firebase Auth emulator + Next + stub providers
#   firestore: Firebase Auth+Firestore emulators + Next (DATA_BACKEND=firestore) + stub providers
#              — the greenfield "does it work end-to-end on Firestore" gate. No Postgres at all.
# Select with DATA_BACKEND: `DATA_BACKEND=firestore pnpm test:e2e` (default prisma).
#
# Common: Auth emulator on :9099 (persona login), Next on :4200, stub OCR/inference/docs (no egress).
# Per-scenario reseed lives in apps/web-app-e2e/support/db.ts (spawns seed:dummy or seed:firestore:e2e).
#
# Usage:
#   pnpm test:e2e                          # full run, prisma backend
#   DATA_BACKEND=firestore pnpm test:e2e   # full run, Firestore backend (emulators)
#   E2E_KEEP_RUNNING=1 pnpm test:e2e       # keep the stack up after the run (repeated dev loops)
#   PLAYWRIGHT_EXTERNAL_APP=1 pnpm test:e2e   # external app already running: skip Next boot
set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$PWD"
ENV_FILE="apps/web-app/.env.local"
EMU_DATA=".emulator-data"
NEXT_PORT="${NEXT_PORT:-4200}"
EMU_PORT=9099
EMU_UI_PORT=4000
FIRESTORE_PORT=8080
# Capture the requested backend BEFORE sourcing .env.local (which could otherwise clobber it).
REQUESTED_BACKEND="${DATA_BACKEND:-prisma}"

# -------- 1. DB URL (prisma only): derive *_e2e from .env.local, refuse anything else --------
if [ "$REQUESTED_BACKEND" != "firestore" ]; then
  TEST_DB_URL="${E2E_DATABASE_URL:-$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | sed 's#/mizan?#/mizan_e2e?#' | sed 's#/mizan_test?#/mizan_e2e?#')}"
  case "$TEST_DB_URL" in
    *mizan_e2e*) ;;
    *) echo "refusing to run: DATABASE_URL is not a *_e2e database (got: ${TEST_DB_URL%%@*}...)" >&2; exit 1 ;;
  esac
fi

# Load the non-DB config from .env.local (S3_*, NEXT_PUBLIC_*, etc.). DB/backend vars are set below.
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

# -------- Common env (both backends) --------
export NODE_ENV=test
export E2E_MODE=1
export OCR_PROVIDER=stub
export INFERENCE_PROVIDER="${INFERENCE_PROVIDER:-stub}"
export DOCS_PROVIDER="${DOCS_PROVIDER:-stub}"
# MoM/SP3 generation (server/docs/mom-sp3.ts) reads these template ids and throws if unset — even under
# DOCS_PROVIDER=stub, where the in-memory drive.files.copy ignores the id entirely. Dummy non-empty
# values satisfy the guard so the MoM/SP3 doc-gen scenarios exercise the stub copy path with no egress.
export GOOGLE_MOM_TEMPLATE_DOC_ID="${GOOGLE_MOM_TEMPLATE_DOC_ID:-stub-mom-template}"
export GOOGLE_SP3_TEMPLATE_DOC_ID="${GOOGLE_SP3_TEMPLATE_DOC_ID:-stub-sp3-template}"
export WEB_RESEARCH_PROVIDER="${WEB_RESEARCH_PROVIDER:-stub}"
export STORAGE_PROVIDER="${STORAGE_PROVIDER:-stub}"
export NEXT_PUBLIC_USE_AUTH_EMULATOR=1
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:${EMU_PORT}"
export PORT="$NEXT_PORT"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:${NEXT_PORT}}"

# -------- Backend-specific env --------
if [ "$REQUESTED_BACKEND" = "firestore" ]; then
  export DATA_BACKEND=firestore
  export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-mizan}"
  export FIRESTORE_EMULATOR_HOST="127.0.0.1:${FIRESTORE_PORT}"
  unset DATABASE_URL || true   # firestore mode never connects to Postgres (db.ts is lazy)
  EMU_ONLY="auth,firestore"
else
  export DATA_BACKEND=prisma
  export DATABASE_URL="$TEST_DB_URL"   # the *_e2e guard above already passed
  EMU_ONLY="auth"
fi

# -------- bookkeeping for cleanup --------
PIDS=()
cleanup() {
  if [ "${E2E_KEEP_RUNNING:-0}" = "1" ]; then
    echo "[e2e] keeping stack running (E2E_KEEP_RUNNING=1). Stop manually."
    return
  fi
  for pid in "${PIDS[@]:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

wait_for_port() {
  local port=$1 label=$2 deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if (echo > "/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
      echo "[e2e] ${label} ready on :${port}"
      return 0
    fi
    sleep 0.5
  done
  echo "[e2e] timed out waiting for ${label} on :${port}" >&2
  return 1
}

# -------- 2. Migrate + seed (prisma only) --------
if [ "$DATA_BACKEND" != "firestore" ]; then
  echo "[e2e] migrate + seed ${DATABASE_URL##*/}"
  ./apps/web-app/node_modules/.bin/prisma migrate deploy --schema apps/web-app/prisma/schema.prisma
  TSX_TSCONFIG_PATH=apps/web-app/tsconfig.json node --import tsx apps/web-app/prisma/seed.ts
fi

# -------- 3. Firebase emulator(s) --------
# "Already running" must mean ALL emulator ports this backend needs are up — not just auth. Otherwise
# (e.g. `pnpm emu` left auth on :9099 but firestore :8080 is down) firestore mode would skip the start
# and then seed against a dead :8080. firestore mode requires BOTH :9099 and :8080.
emu_ports_up() {
  (echo > "/dev/tcp/127.0.0.1/${EMU_PORT}") 2>/dev/null || return 1
  if [ "$DATA_BACKEND" = "firestore" ]; then
    (echo > "/dev/tcp/127.0.0.1/${FIRESTORE_PORT}") 2>/dev/null || return 1
  fi
  return 0
}
if emu_ports_up; then
  echo "[e2e] firebase emulators already running ($EMU_ONLY)"
else
  echo "[e2e] starting Firebase emulators ($EMU_ONLY)"
  EMU_ARGS=(--only "$EMU_ONLY" --project "${FIREBASE_PROJECT_ID:-demo-mizan}")
  [ -d "$EMU_DATA" ] && EMU_ARGS+=(--import "$EMU_DATA")
  setsid ./node_modules/.bin/firebase emulators:start "${EMU_ARGS[@]}" >/tmp/mizan-e2e-emu.log 2>&1 &
  PIDS+=("$!")
fi
# Wait for the backend's required emulator ports whether we started them or are reusing a running set.
wait_for_port "$EMU_PORT" "firebase auth emulator"
[ "$DATA_BACKEND" = "firestore" ] && wait_for_port "$FIRESTORE_PORT" "firestore emulator"

# Provision the demo-logins roster against the running auth emulator (backend-agnostic).
TSX_TSCONFIG_PATH=apps/web-app/tsconfig.json node --import tsx apps/web-app/scripts/seed-emulator-users.ts

# Firestore: fast-fail initial seed (clears emulator + factory + demo) so a broken seed surfaces
# before we launch the browser. The per-scenario Before hook re-runs this between scenarios.
if [ "$DATA_BACKEND" = "firestore" ]; then
  echo "[e2e] initial Firestore seed (clear + factory + demo)"
  pnpm seed:firestore:e2e
fi

# -------- 4. Next app --------
if [ -z "${PLAYWRIGHT_EXTERNAL_APP:-}" ]; then
  if ! (echo > /dev/tcp/127.0.0.1/${NEXT_PORT}) 2>/dev/null; then
    echo "[e2e] starting Next dev on :${NEXT_PORT} (DATA_BACKEND=$DATA_BACKEND)"
    setsid pnpm nx dev web-app --no-tui >/tmp/mizan-e2e-next.log 2>&1 &
    PIDS+=("$!")
    wait_for_port "$NEXT_PORT" "next dev"
  else
    echo "[e2e] next already running on :${NEXT_PORT}"
  fi
fi

# -------- 5. Run cucumber --------
echo "[e2e] running cucumber"
exec ./node_modules/.bin/cucumber-js --config apps/web-app-e2e/cucumber.cjs
