#!/usr/bin/env bash
# Pull-based continuous deployment (systemd timer, every 5 min): when origin/main has
# a new commit whose « CI » workflow succeeded, run deploy.sh. A red or still-running
# commit is never deployed. No secret needed: the repository and its CI status are public.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
REPO_API="${REPO_API:-https://api.github.com/repos/MOCTAR10/trees}"
LOG="${LOG:-/var/log/trees-deploy.log}"

exec 9>/run/trees-deploy.lock
flock -n 9 || exit 0

current=$(git -C "$APP_DIR" rev-parse HEAD)
latest=$(curl -fsS "$REPO_API/commits/main" | python3 -c "import sys,json;print(json.load(sys.stdin)['sha'])")
[ "$latest" = "$current" ] && exit 0

ci=$(curl -fsS "$REPO_API/actions/runs?head_sha=$latest&event=push" | python3 -c "
import sys, json
runs = [r for r in json.load(sys.stdin)['workflow_runs'] if r['name'] == 'CI']
print(runs[0]['conclusion'] or runs[0]['status'] if runs else 'absent')")
if [ "$ci" != "success" ]; then
  echo "$(date -Is) ${latest:0:7} en attente (CI : $ci)" >> "$LOG"
  exit 0
fi

echo "$(date -Is) déploiement ${current:0:7} → ${latest:0:7}" >> "$LOG"
if DEPLOY_SHA="$latest" "$APP_DIR/deploy/deploy.sh" >> "$LOG" 2>&1; then
  echo "$(date -Is) ${latest:0:7} déployé" >> "$LOG"
else
  echo "$(date -Is) !! échec du déploiement de ${latest:0:7}" >> "$LOG"
fi
