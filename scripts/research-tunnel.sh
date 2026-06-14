#!/usr/bin/env bash
# Tunnel local dev → server searxng + firecrawl, so a LOCAL Mizan dev server can use the
# server's research stack (WEB_RESEARCH_PROVIDER=searxng-firecrawl) without running the heavy
# firecrawl containers locally.
#
# searxng has NO published host port on the server (it talks to mizan-web over the internal
# docker network), so we discover its container IP on `mizan_internal` and forward to it.
# firecrawl IS published on the server's 127.0.0.1:3002.
#
# Usage:
#   scripts/research-tunnel.sh            # open/refresh the tunnel (default host: aixel)
#   scripts/research-tunnel.sh <ssh-host> # use a different ssh host/alias
#   scripts/research-tunnel.sh down       # close the tunnel
#
# After it's up, set these in apps/web-app/.env.local and (re)start the dev server:
#   WEB_RESEARCH_PROVIDER=searxng-firecrawl
#   SEARXNG_URL=http://localhost:8089
#   FIRECRAWL_URL=http://localhost:3002
#
# Note: the searxng container IP changes if it is recreated on the server — just re-run this
# script to refresh the tunnel. The tunnel dies on reboot/network drop; re-run to restore.
set -euo pipefail

SEARXNG_LOCAL_PORT="${SEARXNG_LOCAL_PORT:-8089}"
FIRECRAWL_LOCAL_PORT="${FIRECRAWL_LOCAL_PORT:-3002}"

stop_tunnel() {
  # match our forward spec in the backgrounded ssh's cmdline
  pkill -f "ssh -fNT.*-L ${SEARXNG_LOCAL_PORT}:" 2>/dev/null || true
}

if [ "${1:-}" = "down" ] || [ "${1:-}" = "stop" ]; then
  stop_tunnel
  echo "✓ research tunnel closed"
  exit 0
fi

HOST="${1:-aixel}"

echo "→ discovering searxng container IP on '${HOST}' ..."
SXIP=$(ssh -o ConnectTimeout=10 "$HOST" \
  'docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" searxng 2>/dev/null' \
  | tr -d "[:space:]")
if [ -z "$SXIP" ]; then
  echo "✗ could not find the 'searxng' container IP on '${HOST}'."
  echo "  Is the research stack up there?  ssh ${HOST} 'docker ps | grep searxng'"
  exit 1
fi
echo "  searxng @ ${SXIP}:8080  ·  firecrawl @ 127.0.0.1:3002"

stop_tunnel
sleep 1

# -f: background after auth+forward setup · -N: no remote command · -T: no tty
# ExitOnForwardFailure: fail loudly if a local port is busy instead of a half-open tunnel.
ssh -fNT \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L "${SEARXNG_LOCAL_PORT}:${SXIP}:8080" \
  -L "${FIRECRAWL_LOCAL_PORT}:127.0.0.1:3002" \
  "$HOST"

sleep 2
s=$(curl -s --max-time 12 "http://localhost:${SEARXNG_LOCAL_PORT}/search?q=test&format=json" -o /dev/null -w "%{http_code}" || echo 000)
f=$(curl -s --max-time 8  "http://localhost:${FIRECRAWL_LOCAL_PORT}/"                          -o /dev/null -w "%{http_code}" || echo 000)
echo "  searxng  local:${SEARXNG_LOCAL_PORT}  → ${s}"
echo "  firecrawl local:${FIRECRAWL_LOCAL_PORT} → ${f}"
if [ "$s" = "200" ] && [ "$f" = "200" ]; then
  echo "✓ research tunnel up. (close it later with: $0 down)"
else
  echo "✗ tunnel opened but verification failed (searxng=${s} firecrawl=${f})."
  echo "  Check the server stack and re-run."
  exit 1
fi
