#!/usr/bin/env bash
# Cloud Storage integration tests (*.fs.itest.ts under server/storage) against the Firebase Storage
# emulator. Mirrors scripts/test-integration-firestore.sh but boots the STORAGE emulator and runs the
# storage path under STORAGE_PROVIDER=firebase (Google Cloud Storage via firebase-admin).
#
# Requires a JDK on PATH (the emulators are Java jars). `firebase emulators:exec` injects
# FIREBASE_STORAGE_EMULATOR_HOST, which firebase-admin's Storage constructor reads to point the GCS
# client at the emulator — so the Admin SDK enters credential-less emulator mode automatically.
set -euo pipefail
cd "$(dirname "$0")/.."

# Non-DB config (e.g. SUPERADMIN_EMAILS) — safe to source if present, like the other harnesses.
if [ -f apps/web-app/.env.local ]; then set -a; . apps/web-app/.env.local; set +a; fi

export STORAGE_PROVIDER=firebase
export FIREBASE_PROJECT_ID=demo-mizan
export FIREBASE_STORAGE_BUCKET=demo-mizan.appspot.com
export TSX_TSCONFIG_PATH=apps/web-app/tsconfig.test.json
# Defensive: ensure no stray real DATABASE_URL lets an un-ported path touch Postgres.
unset DATABASE_URL || true

FILES="${STORAGE_ITEST_FILES:-apps/web-app/src/server/storage/storage.fs.itest.ts}"

exec ./node_modules/.bin/firebase emulators:exec --only storage --project demo-mizan \
  "node --import tsx --test --test-concurrency=1 $FILES"
