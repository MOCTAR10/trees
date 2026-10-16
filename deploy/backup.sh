#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/trees}"
KEEP_DAYS="${KEEP_DAYS:-14}"
LOG="${LOG:-/var/log/trees-backup.log}"

cd "$APP_DIR"
umask 077
mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%d-%H%M)
target="$BACKUP_DIR/forestry-$stamp.dump"

if docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  pg_dump -U "${PGUSER_:-forestry}" -d "${PGDB_:-forestry}" -Fc > "$target.part"; then
  mv "$target.part" "$target"
  echo "$(date -Is) sauvegarde $(basename "$target") ($(du -h "$target" | cut -f1))" >> "$LOG"
else
  rm -f "$target.part"
  echo "$(date -Is) !! échec de la sauvegarde" >> "$LOG"
  exit 1
fi

find "$BACKUP_DIR" -name 'forestry-*.dump' -mtime +"$KEEP_DAYS" -delete
