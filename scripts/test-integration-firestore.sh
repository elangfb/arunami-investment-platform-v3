#!/usr/bin/env bash
# Firestore integration tests (*.fs.itest.ts) against the Firebase Emulator Suite. Mirrors
# scripts/test-integration.sh (the Postgres harness) but boots the Firestore emulator via
# `firebase emulators:exec` (boot → run → teardown, clean state, no --import) instead of a *_test DB.
#
# Requires a JDK on PATH (the Firestore emulator is a Java jar). DATA_BACKEND=firestore routes the
# repo dispatchers to the *.firestore impls; STORAGE_PROVIDER=stub keeps doc bytes in-memory.
set -euo pipefail
cd "$(dirname "$0")/.."

# Non-DB config (e.g. SUPERADMIN_EMAILS) — safe to source if present, like the Postgres harness.
if [ -f apps/web-app/.env.local ]; then set -a; . apps/web-app/.env.local; set +a; fi

export DATA_BACKEND=firestore
export FIREBASE_PROJECT_ID=demo-mizan
export STORAGE_PROVIDER=stub
export TSX_TSCONFIG_PATH=apps/web-app/tsconfig.test.json
# Defensive: ensure no stray real DATABASE_URL lets an un-ported path touch Postgres.
unset DATABASE_URL || true

# Files to run (override with FS_ITEST_FILES). emulators:exec injects FIRESTORE_EMULATOR_HOST so the
# Admin SDK (getDb / getAdminApp) auto-enters credential-less emulator mode. Node's --test expands the
# glob (incl. **), so one recursive pattern covers every server/**/*.fs.itest.ts (repo, scheduling,
# research, ai, docs, templates, actions, config).
FILES="${FS_ITEST_FILES:-apps/web-app/src/server/**/*.fs.itest.ts}"

exec ./node_modules/.bin/firebase emulators:exec --only firestore --project demo-mizan \
  "node --import tsx --test --test-concurrency=1 $FILES"
