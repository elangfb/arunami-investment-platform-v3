#!/usr/bin/env bash
set -euo pipefail

# Pull GHCR images and deploy only when the target image changed (or when forced).
# Usage:
#   GHCR_IMAGE_PREFIX=ghcr.io/<owner> ./scripts/deploy-ghcr.sh [tag]
# Env:
#   COMPOSE_FILES="compose.shared.yaml compose.ghcr.yaml"
#   IMAGE_TAG=main
#   FORCE_DEPLOY=1          # run migrate/recreate even if image id did not change
#   SKIP_PULL=1             # useful for local testing; do not pull before comparing

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES="${COMPOSE_FILES:-compose.shared.yaml compose.ghcr.yaml}"
CLI_IMAGE_TAG="${1:-}"
read -r -a COMPOSE_FILE_LIST <<< "$COMPOSE_FILES"
COMPOSE_ARGS=()
for file in "${COMPOSE_FILE_LIST[@]}"; do
  COMPOSE_ARGS+=( -f "$file" )
done

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.production.example to .env and fill it first." >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    index($0, key "=") == 1 {
      sub(/^[^=]*=/, "")
      gsub(/^"|"$/, "")
      gsub(/^'"'"'|'"'"'$/, "")
      print
      exit
    }
  ' .env
}

image_id() {
  local image="$1"
  docker image inspect "$image" --format '{{.Id}}' 2>/dev/null || true
}

running_service_image_id() {
  local service="$1"
  local cid
  cid="$(docker compose "${COMPOSE_ARGS[@]}" ps -q "$service" 2>/dev/null || true)"
  [[ -n "$cid" ]] || return 0
  docker inspect "$cid" --format '{{.Image}}' 2>/dev/null || true
}

GHCR_IMAGE_PREFIX="${GHCR_IMAGE_PREFIX:-$(read_env_value GHCR_IMAGE_PREFIX)}"
if [[ -z "${CLI_IMAGE_TAG}" ]]; then
  IMAGE_TAG="${IMAGE_TAG:-$(read_env_value IMAGE_TAG)}"
  IMAGE_TAG="${IMAGE_TAG:-main}"
else
  IMAGE_TAG="${CLI_IMAGE_TAG}"
fi
export GHCR_IMAGE_PREFIX IMAGE_TAG

if [[ -z "${GHCR_IMAGE_PREFIX:-}" || "${GHCR_IMAGE_PREFIX}" == *CHANGE_ME* ]]; then
  echo "Set GHCR_IMAGE_PREFIX in .env or the environment, e.g. ghcr.io/<owner>." >&2
  exit 1
fi

web_image="${GHCR_IMAGE_PREFIX}/mizan-web:${IMAGE_TAG}"
migrate_image="${GHCR_IMAGE_PREFIX}/mizan-migrate:${IMAGE_TAG}"

before_web_id="$(image_id "$web_image")"
before_migrate_id="$(image_id "$migrate_image")"

echo "Checking ${GHCR_IMAGE_PREFIX}/mizan-{migrate,web}:${IMAGE_TAG} via ${COMPOSE_FILES}"

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  docker compose "${COMPOSE_ARGS[@]}" pull migrate web
else
  echo "SKIP_PULL=1: not pulling images"
fi

after_web_id="$(image_id "$web_image")"
after_migrate_id="$(image_id "$migrate_image")"

running_web_id="$(running_service_image_id web || true)"
image_changed=0
if [[ -z "$running_web_id" ]]; then
  echo "No running web container/image found; deploy required."
  image_changed=1
elif [[ "$running_web_id" != "$after_web_id" ]]; then
  echo "Web image differs from running container; deploy required."
  image_changed=1
elif [[ "$before_web_id" != "$after_web_id" || "$before_migrate_id" != "$after_migrate_id" ]]; then
  echo "Pulled a new image digest; deploy required."
  image_changed=1
fi

if [[ "${FORCE_DEPLOY:-0}" == "1" ]]; then
  echo "FORCE_DEPLOY=1: deploy required."
  image_changed=1
fi

if [[ "$image_changed" != "1" ]]; then
  echo "No new image; leaving stack unchanged."
  docker compose "${COMPOSE_ARGS[@]}" ps
  exit 0
fi

if [[ -z "$after_web_id" || -z "$after_migrate_id" ]]; then
  echo "Missing pulled image(s); cannot deploy." >&2
  echo "web=${after_web_id:-missing} migrate=${after_migrate_id:-missing}" >&2
  exit 1
fi

echo "Deploying ${GHCR_IMAGE_PREFIX}/mizan-{migrate,web}:${IMAGE_TAG}"

docker compose "${COMPOSE_ARGS[@]}" up -d postgres seaweedfs searxng firecrawl

# Re-run the one-shot migrator on every deploy before the new web starts.
docker compose "${COMPOSE_ARGS[@]}" up --no-deps --force-recreate migrate

docker compose "${COMPOSE_ARGS[@]}" up -d --no-deps --force-recreate web

docker compose "${COMPOSE_ARGS[@]}" up -d caddy

docker compose "${COMPOSE_ARGS[@]}" ps
