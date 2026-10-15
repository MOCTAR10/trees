#!/usr/bin/env bash
# One-time setup of the web app host, as root.
# Usage: WEB_HOST=foresterie-app.greenleaves.ga bash deploy/web/setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
WEB_HOST="${WEB_HOST:?WEB_HOST requis (ex. foresterie-app.greenleaves.ga)}"
cd "$APP_DIR"

api_key=$(grep -E '^API_KEY=' .env | cut -d= -f2- | tr -d '"')
sed -e "s/__DOMAIN__/$WEB_HOST/g" -e "s|__API_KEY__|$api_key|g" deploy/web/nginx-web.conf \
  > /etc/nginx/sites-available/trees-web.conf
chmod 600 /etc/nginx/sites-available/trees-web.conf
ln -sf /etc/nginx/sites-available/trees-web.conf /etc/nginx/sites-enabled/trees-web.conf

FORCE_WEB=1 bash deploy/web/build.sh
nginx -t && systemctl reload nginx
if ! certbot certificates 2>/dev/null | grep -q "Domains: $WEB_HOST"; then
  certbot --nginx --non-interactive --agree-tos --redirect --register-unsafely-without-email -d "$WEB_HOST" \
    || echo "!! Certificat non obtenu pour $WEB_HOST (DNS ?) — relancer ce script plus tard"
fi
echo "Application web : https://$WEB_HOST"
