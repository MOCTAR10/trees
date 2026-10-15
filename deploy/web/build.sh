#!/usr/bin/env bash
# Build the web app (expo export) into /var/www/trees-web when mobile/ changed since
# the last build. Runs in a throw-away Node container with low CPU priority and a
# memory cap, so the users' app is never slowed down. Called by deploy.sh.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
OUT="${WEB_OUT:-/var/www/trees-web}"
STAMP="$OUT/.built-from"
cd "$APP_DIR"

head=$(git rev-parse HEAD)
if [ -f "$STAMP" ] && [ "${FORCE_WEB:-}" != "1" ]; then
  last=$(cat "$STAMP")
  if git cat-file -e "$last" 2>/dev/null && git diff --quiet "$last" "$head" -- mobile; then
    echo "web: à jour (${last:0:7})"
    exit 0
  fi
fi

echo "web: construction depuis ${head:0:7}"
mkdir -p "$OUT.next"
rm -rf "${OUT:?}.next"/*
docker run --rm --cpu-shares 128 --cpus 3 --memory 4g \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 -e EXPO_PUBLIC_API_URL= -e EXPO_NO_TELEMETRY=1 \
  -v "$APP_DIR/mobile:/src" -v "$OUT.next:/out" -w /src node:22-bookworm-slim \
  sh -c "npm ci --no-audit --no-fund --loglevel=error && npx expo export --platform web --output-dir /out"
echo "$head" > "$OUT.next/.built-from"
rm -rf "$OUT.prev"
if [ -d "$OUT" ]; then mv "$OUT" "$OUT.prev"; fi
mv "$OUT.next" "$OUT"
echo "web: publié ($(du -sh "$OUT" | cut -f1))"
