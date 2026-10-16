#!/usr/bin/env bash
# Latest errors and slow starts reported by the apps (POST /api/v1/client-log).
# Usage: deploy/client-logs.sh [since]   e.g. deploy/client-logs.sh 24h   (default 48h)
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
SINCE="${1:-48h}"
cd "$APP_DIR"

docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --no-color --since "$SINCE" api 2>/dev/null \
  | grep -o 'client-log {.*}' \
  | sed 's/^client-log //' \
  | python3 -c '
import json, sys
rows = [json.loads(line) for line in sys.stdin if line.strip()]
if not rows:
    print("Aucun incident remonté par les applications.")
for r in rows:
    print(f"[{r.get(\"kind\")}] v{r.get(\"app_version\")} {r.get(\"platform\")} utilisateur {r.get(\"user_id\")}")
    print("   ", r.get("message"))
    if r.get("timings_ms"):
        print("    étapes (ms):", r["timings_ms"])
    if r.get("stack"):
        print("   ", r["stack"].splitlines()[0][:200])
'
