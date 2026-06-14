#!/usr/bin/env bash
# Mizan restore (Tier 2.4) — counterpart to backup.sh. DESTRUCTIVE: overwrites the
# current database and document store. Run with the stack up (postgres + seaweedfs).
#
# Usage:  ./scripts/restore.sh backups/pg-<TS>.sql.gz backups/seaweed-<TS>.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE:-docker compose -f compose.shared.yaml -f compose.ghcr.yaml}"
PG_DUMP="${1:?usage: restore.sh <pg-dump.sql.gz> <seaweed.tar.gz>}"
SEAWEED_TAR="${2:?usage: restore.sh <pg-dump.sql.gz> <seaweed.tar.gz>}"

[ -f .env ] && set -a && . ./.env && set +a
PGUSER="${POSTGRES_USER:-mizan}"
PGDB="${POSTGRES_DB:-mizan}"

read -rp "This OVERWRITES the live DB ($PGDB) and document store. Type 'yes' to proceed: " ok
[ "$ok" = "yes" ] || { echo "aborted"; exit 1; }

echo "→ Restoring Postgres"
gunzip -c "$PG_DUMP" | $COMPOSE exec -T postgres psql -U "$PGUSER" -d "$PGDB"

VOL="${SEAWEED_VOLUME:-mizan_seaweed}"
echo "→ Restoring SeaweedFS volume ($VOL) — stopping seaweedfs first"
$COMPOSE stop seaweedfs
docker run --rm -v "$VOL":/data -v "$(cd "$(dirname "$SEAWEED_TAR")" && pwd)":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$SEAWEED_TAR") -C /data"
$COMPOSE start seaweedfs

echo "✓ Restore complete. Verify document integrity: stored SHA-256 (Postgres) vs object bytes."
