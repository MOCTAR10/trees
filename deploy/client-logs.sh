#!/usr/bin/env bash
# Latest errors and slow starts reported by the apps (POST /api/v1/client-log).
# Usage: deploy/client-logs.sh [since]   e.g. deploy/client-logs.sh 24h   (default 48h)
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
SINCE="${1:-48h}"
cd "$APP_DIR"

read -r -d '' READER <<'PY' || true
import json, sys

rows = []
for line in sys.stdin:
    line = line.strip()
    if line:
        rows.append(json.loads(line))
if not rows:
    print("Aucun incident remonté par les applications.")
for r in rows:
    print("[%s] v%s %s utilisateur %s" % (r.get("kind"), r.get("app_version"), r.get("platform"), r.get("user_id")))
    print("   ", r.get("message"))
    if r.get("timings_ms"):
        print("    étapes (ms):", r["timings_ms"])
    if r.get("stack"):
        print("   ", r["stack"].splitlines()[0][:200])
PY

docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --no-color --since "$SINCE" api 2>/dev/null \
  | { grep -o 'client-log {.*}' || true; } \
  | sed 's/^client-log //' \
  | python3 -c "$READER"
