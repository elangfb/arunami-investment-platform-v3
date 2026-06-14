#!/usr/bin/env bash
set -euo pipefail

# Install the pull-based auto-deploy as a systemd *USER* service on a Mizan dev/staging host.
# Runs as your normal login user — NO root/sudo. The timer periodically runs
# scripts/deploy-ghcr.sh, which pulls the configured GHCR image tag and re-deploys
# (migrate -> web -> caddy) ONLY when the image digest changed (a no-op otherwise).
#
# Prereqs (all as your normal user — see docs/guides/deployment.md "GHCR image deploys"):
#   1. Repo checked out at $MIZAN_DIR (this script's repo root by default).
#   2. .env there with GHCR_IMAGE_PREFIX + IMAGE_TAG (and runtime secrets).
#   3. This user reaches docker WITHOUT sudo (in the `docker` group, or rootless Docker)
#      and has run `docker login ghcr.io`.
#   4. A first deploy has succeeded once (./scripts/deploy-ghcr.sh) so the stack exists.
#
# Usage (NO sudo):
#   ./scripts/install-autodeploy.sh
#   MIZAN_DIR=/srv/mizan INTERVAL=5min ./scripts/install-autodeploy.sh
#
# Env:
#   MIZAN_DIR   repo root on the host (default: this script's repo root)
#   INTERVAL    systemd OnUnitActiveSec value (default: 3min)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIZAN_DIR="${MIZAN_DIR:-$REPO_ROOT}"
INTERVAL="${INTERVAL:-3min}"
UNIT_SRC="$MIZAN_DIR/ops/systemd"
UNIT_DST="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run as your normal user, NOT root/sudo — this installs a systemd *user* service." >&2
  exit 1
fi

if [[ ! -x "$MIZAN_DIR/scripts/deploy-ghcr.sh" ]]; then
  echo "Missing $MIZAN_DIR/scripts/deploy-ghcr.sh — set MIZAN_DIR to the repo root on this host." >&2
  exit 1
fi
if [[ ! -f "$MIZAN_DIR/.env" ]]; then
  echo "Missing $MIZAN_DIR/.env — copy .env.production.example to .env and fill it first." >&2
  exit 1
fi

# Docker must be usable without sudo (docker group or rootless), else the timer can't deploy.
if ! docker info >/dev/null 2>&1; then
  echo "WARNING: 'docker info' failed as $USER — the timer will not be able to pull/deploy." >&2
  echo "         Fix with: sudo usermod -aG docker $USER && newgrp docker  (or rootless Docker)." >&2
  echo "         Installing the units anyway; re-check once docker works for this user." >&2
fi

echo "Installing Mizan auto-deploy (systemctl --user):"
echo "  repo dir : $MIZAN_DIR"
echo "  interval : every $INTERVAL (after a 2min OnBootSec delay)"
echo "  run as   : $USER (user manager, no root)"
echo "  unit dir : $UNIT_DST"

mkdir -p "$UNIT_DST"
sed -e "s#__MIZAN_DIR__#${MIZAN_DIR}#g" "$UNIT_SRC/mizan-deploy.service" > "$UNIT_DST/mizan-deploy.service"
sed -e "s#__MIZAN_DIR__#${MIZAN_DIR}#g" -e "s#__INTERVAL__#${INTERVAL}#g" \
  "$UNIT_SRC/mizan-deploy.timer" > "$UNIT_DST/mizan-deploy.timer"

systemctl --user daemon-reload
systemctl --user enable --now mizan-deploy.timer

# Linger lets the user manager (and thus the timer) run without an active login session —
# essential on a headless host. Self-linger is usually allowed without sudo via polkit;
# if it isn't, fall back to a printed instruction rather than forcing root.
if loginctl enable-linger "$USER" 2>/dev/null; then
  echo "Enabled linger for $USER — timer runs even when you are not logged in."
else
  echo "NOTE: could not enable linger automatically (needs polkit/root on this host)."
  echo "      Run once:  sudo loginctl enable-linger $USER"
  echo "      Without linger the timer only runs while you have an active login session."
fi

echo
echo "Installed. Timer status:"
systemctl --user status --no-pager mizan-deploy.timer | sed -n '1,6p' || true
echo
echo "Next runs:"
systemctl --user list-timers --no-pager mizan-deploy.timer || true
echo
echo "Deploy now (don't wait for the tick):  systemctl --user start mizan-deploy.service"
echo "Watch a deploy run:                    journalctl --user -u mizan-deploy.service -f"
echo "Pause auto-deploy:                     systemctl --user disable --now mizan-deploy.timer"
