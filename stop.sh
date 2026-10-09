#!/usr/bin/env bash
# Stops Paperwork Pilot. Data is kept. To wipe the database too: docker compose down -v
set -euo pipefail
cd "$(dirname "$0")"
docker compose down
echo "Stopped. Run ./start.sh to start again. Your data is kept."
