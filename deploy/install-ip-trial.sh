#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/kotoba
ARCHIVE=/tmp/kotoba-deploy.tar.gz
SOURCE_ENV=/tmp/kotoba-source.env
PUBLIC_ORIGIN=http://8.134.179.177:8080
DB_CONTAINER=mysql
DB_APP_USER=kotoba_app

cleanup() {
  rm -f "$ARCHIVE" "$SOURCE_ENV"
}
trap cleanup EXIT

if [[ ! -f "$ARCHIVE" || ! -f "$SOURCE_ENV" ]]; then
  echo "Deployment archive or temporary database environment is missing." >&2
  exit 1
fi

DB_NAME=$(sed -n 's/^DB_NAME=//p' "$SOURCE_ENV" | head -n 1 | tr -d '\r')
ROOT_DB_PASSWORD=$(sed -n 's/^DB_PASSWORD=//p' "$SOURCE_ENV" | head -n 1 | tr -d '\r')
if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ || -z "$ROOT_DB_PASSWORD" ]]; then
  echo "Temporary database configuration is invalid." >&2
  exit 1
fi

APP_DB_PASSWORD=$(openssl rand -base64 36 | tr -d '\n')
docker exec \
  -e MYSQL_PWD="$ROOT_DB_PASSWORD" \
  -e APP_DB_PASSWORD="$APP_DB_PASSWORD" \
  -e APP_DB_NAME="$DB_NAME" \
  -e APP_DB_USER="$DB_APP_USER" \
  "$DB_CONTAINER" sh -c '
    mysql -uroot -e "
      CREATE USER IF NOT EXISTS '\''${APP_DB_USER}'\''@'\''172.%'\'' IDENTIFIED BY '\''${APP_DB_PASSWORD}'\'';
      ALTER USER '\''${APP_DB_USER}'\''@'\''172.%'\'' IDENTIFIED BY '\''${APP_DB_PASSWORD}'\'';
      GRANT SELECT, INSERT, UPDATE, DELETE ON \`${APP_DB_NAME}\`.* TO '\''${APP_DB_USER}'\''@'\''172.%'\'';
    "
  '

if ! id kotoba >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash kotoba
fi

if [[ -d "$APP_DIR" ]]; then
  mv "$APP_DIR" "${APP_DIR}.backup.$(date +%Y%m%d%H%M%S)"
fi
install -d -o kotoba -g kotoba "$APP_DIR"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
chown -R kotoba:kotoba "$APP_DIR"

cat >"$APP_DIR/.env" <<EOF
DB_HOST=127.0.0.1
DB_PORT=3308
DB_NAME=$DB_NAME
DB_USER=$DB_APP_USER
DB_PASSWORD=$APP_DB_PASSWORD
DB_SSL=false
DB_SSL_CA_PATH=
DB_SSL_REJECT_UNAUTHORIZED=true

API_HOST=0.0.0.0
API_PORT=8080
SESSION_DAYS=30
ALLOW_REGISTRATION=true
APP_ORIGINS=$PUBLIC_ORIGIN
APP_PUBLIC_URL=$PUBLIC_ORIGIN
COOKIE_SECURE=false
TRUST_PROXY=false
EOF
chown kotoba:kotoba "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

cd "$APP_DIR"
runuser -u kotoba -- npm ci
runuser -u kotoba -- npm run build

install -m 0644 "$APP_DIR/deploy/kotoba.service" /etc/systemd/system/kotoba.service
systemctl daemon-reload
systemctl enable --now kotoba

if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=8080/tcp
  firewall-cmd --reload
fi

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
    echo "Kotoba is healthy at $PUBLIC_ORIGIN"
    exit 0
  fi
  sleep 1
done

journalctl -u kotoba -n 80 --no-pager
echo "Kotoba did not become healthy after deployment." >&2
exit 1
