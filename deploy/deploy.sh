#!/usr/bin/env bash
# Update the server to origin/main: pull, rebuild, apply new migrations, restart, check.
# Usage (on the server): /var/www/trees/deploy/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
BRANCH="${BRANCH:-main}"
cd "$APP_DIR"

compose() { docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"; }
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"'; }
PGUSER_="$(env_value POSTGRES_USER)"
PGDB_="$(env_value POSTGRES_DB)"
psql_db() { compose exec -T db psql -v ON_ERROR_STOP=1 -U "${PGUSER_:-forestry}" -d "${PGDB_:-forestry}" "$@"; }

echo "== Code: $BRANCH"
git fetch --quiet origin "$BRANCH"
# DEPLOY_SHA (set by autodeploy.sh) pins the exact commit whose CI is green.
git reset --hard "${DEPLOY_SHA:-origin/$BRANCH}"
git log --oneline -1

echo "== Build and start"
compose build --pull
compose up -d --wait --wait-timeout 600 db
# A fresh volume runs the init scripts on a temporary server, then restarts:
# wait for the real server before touching the schema.
for i in $(seq 1 120); do
  if compose logs db 2>/dev/null | grep -qE "init process complete|Skipping initialization" \
    && psql_db -At -c "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" = 120 ]; then echo "!! Base de données indisponible"; exit 1; fi
  sleep 5
done

echo "== Migrations"
psql_db -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
applied=$(psql_db -At -c "SELECT count(*) FROM schema_migrations")
if [ "$applied" = "0" ]; then
  # Fresh volume: the init scripts already ran every mounted migration.
  for f in db/migrations/*.sql; do
    psql_db -q -c "INSERT INTO schema_migrations (filename) VALUES ('$(basename "$f")') ON CONFLICT DO NOTHING"
  done
  echo "baseline: $(ls db/migrations/*.sql | wc -l) migrations recorded"
else
  for f in db/migrations/*.sql; do
    name=$(basename "$f")
    done_already=$(psql_db -At -c "SELECT 1 FROM schema_migrations WHERE filename = '$name'")
    if [ -z "$done_already" ]; then
      echo "applying $name"
      psql_db -q < "$f"
      psql_db -q -c "INSERT INTO schema_migrations (filename) VALUES ('$name')"
    fi
  done
fi

# Code is bind-mounted: recreate so the new code is loaded.
compose up -d --force-recreate --wait --wait-timeout 900 api gateway
compose ps

echo "== Health"
curl -fsS http://127.0.0.1:3000/health && echo
echo "Deployed $(git rev-parse --short HEAD) at $(date -Is)"
