#!/usr/bin/env bash
# Firebase Auth Emulator (dev only) — fully local Google login, no real Firebase.
#
# We use ONLY Firebase Auth, so this runs `--only auth`. A `demo-` project id keeps
# it fully offline (no real project/keys needed). Accounts you create persist across
# restarts via --export-on-exit; on the first run there is no data dir yet, so --import
# is added only when it already exists.
#
# Pair with NEXT_PUBLIC_USE_AUTH_EMULATOR=1 in apps/web-app/.env.local, then `pnpm dev`.
# Emulator UI (browse/create users): http://127.0.0.1:4000
set -euo pipefail

cd "$(dirname "$0")/.."

DATA_DIR=".emulator-data"
ARGS=(--only auth --project demo-mizan --export-on-exit "$DATA_DIR")
[ -d "$DATA_DIR" ] && ARGS+=(--import "$DATA_DIR")

exec ./node_modules/.bin/firebase emulators:start "${ARGS[@]}"
