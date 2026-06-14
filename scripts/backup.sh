#!/usr/bin/env bash
# Mizan backup (Tier 2.4) — OJK retention durability.
#   - Postgres: logical dump via pg_dump (consistent point-in-time).
#   - Documents: archive of the SeaweedFS data volume (the SHA-256 in Postgres is the
#     authoritative integrity check on restore).
# Defaults to ./backups; POINT $BACKUP_DIR at an offsite/NAS target and schedule via cron.
# Retention: keeps the newest $KEEP sets (default 14); adjust for your OJK policy.
#
# Usage:  ./scripts/backup.sh
#   BACKUP_DIR=/mnt/nas/mizan KEEP=30 ./scripts/backup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE:-docker compose -f compose.shared.yaml -f compose.ghcr.yaml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

# Load POSTGRES_USER / POSTGRES_DB (compose env file).
[ -f .env ] && set -a && . ./.env && set +a
PGUSER="${POSTGRES_USER:-mizan}"
PGDB="${POSTGRES_DB:-mizan}"

mkdir -p "$BACKUP_DIR"
echo "→ Postgres dump (db=$PGDB)"
$COMPOSE exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" --clean --if-exists \
  | gzip > "$BACKUP_DIR/pg-$TS.sql.gz"

# SeaweedFS data lives in the named volume (compose project 'mizan' → 'mizan_seaweed').
VOL="$($COMPOSE config --format json 2>/dev/null | grep -o '"mizan_seaweed"' | head -1 | tr -d '"')"
VOL="${VOL:-mizan_seaweed}"
echo "→ SeaweedFS volume archive ($VOL)"
docker run --rm -v "$VOL":/data:ro -v "$(cd "$BACKUP_DIR" && pwd)":/backup alpine \
  tar czf "/backup/seaweed-$TS.tar.gz" -C /data .

echo "→ Pruning to newest $KEEP sets"
ls -1t "$BACKUP_DIR"/pg-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
ls -1t "$BACKUP_DIR"/seaweed-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "✓ Backup complete: $BACKUP_DIR/{pg,seaweed}-$TS.*"
echo "  Off-host copy is YOUR responsibility — replicate $BACKUP_DIR offsite."
