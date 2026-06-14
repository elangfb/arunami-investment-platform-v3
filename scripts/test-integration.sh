#!/usr/bin/env bash
# Integration tests (*.itest.ts) against a THROWAWAY Postgres. Derives the URL from
# .env.local by swapping the db name to mizan_test, and refuses anything not *_test
# so it can never touch dev/prod data. One-time setup:
#   docker exec pgsql psql -U postgres -c "CREATE DATABASE mizan_test"
#   DATABASE_URL=<...mizan_test...> ./apps/web-app/node_modules/.bin/prisma migrate deploy
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_DB_URL="${TEST_DATABASE_URL:-$(grep -E '^DATABASE_URL=' apps/web-app/.env.local | cut -d= -f2- | sed 's#/mizan?#/mizan_test?#')}"

# Load the non-DB config (S3_* for the document round-trip, etc.) from .env.local when
# present — tests that need the object store read these. CI sets them in the job env.
if [ -f apps/web-app/.env.local ]; then
  set -a; . apps/web-app/.env.local; set +a
fi

case "$TEST_DB_URL" in
  *mizan_test*) ;;
  *) echo "refusing to run: DATABASE_URL is not a *_test database" >&2; exit 1 ;;
esac

# Force the throwaway DB, overriding whatever .env.local sourced above (safety: the
# guard already proved TEST_DB_URL is a *_test database).
export DATABASE_URL="$TEST_DB_URL"
export TSX_TSCONFIG_PATH=apps/web-app/tsconfig.test.json
exec node --import tsx --test "apps/web-app/src/**/*.itest.ts"
