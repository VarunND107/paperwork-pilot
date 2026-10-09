#!/usr/bin/env bash
# Paperwork Pilot - one-command start for macOS / Linux (Windows users: start.bat).
# Needs Docker. First run creates .env with random secrets, then builds and starts everything.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker was not found. Install Docker, then run ./start.sh again." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Start it, then run ./start.sh again." >&2
  exit 1
fi

rand_hex() { # rand_hex <bytes>
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

if [ ! -f .env ]; then
  echo "First run: creating .env with fresh random secrets..."
  sed \
    -e "s/change-me-postgres/$(rand_hex 16)/g" \
    -e "s/change-me-session/$(rand_hex 32)/g" \
    -e "s/change-me-admin/$(rand_hex 8)/g" \
    .env.example > .env
  chmod 600 .env
fi

echo "Building and starting Paperwork Pilot. The first run takes a few minutes..."
docker compose up --build -d --wait

WEB_PORT="$(grep -E '^WEB_PORT=' .env | cut -d= -f2- || true)"
URL="http://localhost:${WEB_PORT:-8080}"
ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' .env | cut -d= -f2- || true)"

echo
echo "==========================================================="
echo " Paperwork Pilot is running at ${URL}"
echo " Admin panel:  ${URL}/admin"
echo " Admin password (from .env):  ${ADMIN_PASSWORD}"
echo " Stop it with ./stop.sh"
echo "==========================================================="

if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then open "$URL" || true
fi
