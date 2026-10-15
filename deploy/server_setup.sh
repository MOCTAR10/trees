#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu/Debian server for Foresterie Numérique.
# Usage (as root): DOMAIN=api.greenleaves.ga EMAIL=you@example.com bash server_setup.sh
# Idempotent: re-running keeps the existing .env (secrets) and data.
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN requis (ex. api.greenleaves.ga)}"
EMAIL="${EMAIL:?EMAIL requis pour le certificat TLS}"
APP_DIR="${APP_DIR:-/var/www/trees}"
REPO="${REPO:-https://github.com/MOCTAR10/trees.git}"
AI="${AI_MODELS_ENABLED:-true}"

echo "== Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates nginx certbot python3-certbot-nginx ufw openssl
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker nginx

echo "== Firewall (SSH, HTTP, HTTPS only)"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "== Code in $APP_DIR"
mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --quiet "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "== .env (secrets generated once, never committed)"
if [ ! -f .env ]; then
  secret() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
  cp .env.example .env
  set_env() {
    if grep -qE "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
  }
  PG_PASS="$(secret 32)"
  set_env POSTGRES_USER forestry
  set_env POSTGRES_PASSWORD "$PG_PASS"
  set_env POSTGRES_DB forestry
  set_env DATABASE_URL "postgresql+asyncpg://forestry:${PG_PASS}@db:5432/forestry"
  set_env JWT_SECRET "$(secret 64)"
  set_env ADMIN_EMAIL "admin@greenleaves.ga"
  set_env ADMIN_PASSWORD "$(secret 20)"
  set_env REQUIRE_API_KEY true
  set_env API_KEY "$(secret 40)"
  set_env TRUST_PROXY 1
  set_env AI_MODELS_ENABLED "$AI"
  chmod 600 .env
  echo ".env créé (mots de passe dans $APP_DIR/.env, lisible par root seulement)"
fi

echo "== nginx + TLS for $DOMAIN"
mkdir -p /var/www/certbot
sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx/trees.conf > /etc/nginx/sites-available/trees.conf
ln -sf /etc/nginx/sites-available/trees.conf /etc/nginx/sites-enabled/trees.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
if ! certbot certificates 2>/dev/null | grep -q "Domains: $DOMAIN"; then
  certbot --nginx --non-interactive --agree-tos --redirect -m "$EMAIL" -d "$DOMAIN" \
    || echo "!! Certificat non obtenu (DNS de $DOMAIN pas encore propagé ?) — relancer ce script plus tard"
fi

echo "== Stack"
chmod +x deploy/deploy.sh
deploy/deploy.sh

echo "== Reference data"
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T api python -m tools.import_provinces
echo "Setup terminé."
