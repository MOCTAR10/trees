#!/usr/bin/env bash
# One-time setup of Jenkins (Android builds) on the production server, as root.
# Usage: JENKINS_HOST=jenkins.greenleaves.ga bash deploy/jenkins/setup.sh
# Secrets are generated here, stay in /etc/trees (root + uid 1000 only) and are never committed.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/trees}"
JENKINS_HOST="${JENKINS_HOST:?JENKINS_HOST requis (ex. jenkins.greenleaves.ga)}"
APP_URL="${APP_URL:-https://greenleaves.ga}"
cd "$APP_DIR"

secret() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c "$1"; }
mkdir -p /etc/trees/android /var/www/trees-apk
chown 1000:1000 /var/www/trees-apk

if [ ! -f /etc/trees/jenkins.env ]; then
  api_key=$(grep -E '^API_KEY=' .env | cut -d= -f2-)
  {
    echo "JENKINS_HOST=$JENKINS_HOST"
    echo "JENKINS_ADMIN_PASSWORD=$(secret 24)"
    echo "EXPO_PUBLIC_API_URL=$APP_URL"
    echo "EXPO_PUBLIC_API_KEY=$api_key"
    echo "ANDROID_KEY_ALIAS=foresterie"
    echo "ANDROID_KEYSTORE_PASSWORD=$(secret 32)"
  } > /etc/trees/jenkins.env
  chmod 600 /etc/trees/jenkins.env
  echo "jenkins.env créé (mot de passe admin et clé de signature dans /etc/trees/jenkins.env)"
fi

if [ ! -f /etc/trees/android/release.keystore ]; then
  pass=$(grep -E '^ANDROID_KEYSTORE_PASSWORD=' /etc/trees/jenkins.env | cut -d= -f2-)
  docker run --rm -v /etc/trees/android:/out eclipse-temurin:17-jdk keytool -genkeypair -v \
    -keystore /out/release.keystore -alias foresterie -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$pass" -keypass "$pass" \
    -dname "CN=Foresterie Numerique, O=Green Leaves, L=Libreville, C=GA" > /dev/null
  chown 1000:1000 /etc/trees/android/release.keystore
  chmod 400 /etc/trees/android/release.keystore
  echo "Clé de signature créée : /etc/trees/android/release.keystore — À SAUVEGARDER hors du serveur"
fi

echo "== nginx : $JENKINS_HOST et téléchargement de l'APK"
sed "s/__DOMAIN__/$JENKINS_HOST/g" deploy/jenkins/nginx-jenkins.conf > /etc/nginx/sites-available/trees-jenkins.conf
ln -sf /etc/nginx/sites-available/trees-jenkins.conf /etc/nginx/sites-enabled/trees-jenkins.conf
cp deploy/nginx/trees-apk.snippet /etc/nginx/snippets/trees-apk.conf
grep -q "snippets/trees-apk.conf" /etc/nginx/sites-available/trees.conf \
  || sed -i "0,/location \/ {/s//include snippets\/trees-apk.conf;\n\n    location \/ {/" /etc/nginx/sites-available/trees.conf
nginx -t && systemctl reload nginx
if ! certbot certificates 2>/dev/null | grep -q "Domains: $JENKINS_HOST"; then
  certbot --nginx --non-interactive --agree-tos --redirect --register-unsafely-without-email -d "$JENKINS_HOST" \
    || echo "!! Certificat non obtenu pour $JENKINS_HOST (DNS ?) — relancer ce script plus tard"
fi

echo "== Jenkins"
docker compose -f deploy/jenkins/docker-compose.yml up -d --build
echo "Jenkins : https://$JENKINS_HOST (utilisateur admin, mot de passe dans /etc/trees/jenkins.env)"
