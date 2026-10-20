#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/kotoba
ARCHIVE=/tmp/kotoba-update.tar.gz
ROOT_ENV=/tmp/kotoba-root.env
DB_CONTAINER=mysql
NEXT_DIR="${APP_DIR}.next.$$"
BACKUP_DIR="${APP_DIR}.backup.$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "$NEXT_DIR"
  rm -f "$ARCHIVE"
  rm -f "$ROOT_ENV"
}
trap cleanup EXIT

if [[ ! -f "$ARCHIVE" || ! -f "$APP_DIR/.env" ]]; then
  echo "Update archive or production environment is missing." >&2
  exit 1
fi

install -d -o kotoba -g kotoba "$NEXT_DIR"
tar -xzf "$ARCHIVE" -C "$NEXT_DIR"
install -o kotoba -g kotoba -m 0600 "$APP_DIR/.env" "$NEXT_DIR/.env"
chown -R kotoba:kotoba "$NEXT_DIR"

cd "$NEXT_DIR"
runuser -u kotoba -- npm ci
if [[ -f "$ROOT_ENV" ]]; then
  DB_NAME=$(sed -n 's/^DB_NAME=//p' "$ROOT_ENV" | head -n 1 | tr -d '\r')
  ROOT_DB_PASSWORD=$(sed -n 's/^DB_PASSWORD=//p' "$ROOT_ENV" | head -n 1 | tr -d '\r')
  if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ || -z "$ROOT_DB_PASSWORD" ]]; then
    echo 'Temporary root database configuration is invalid.' >&2
    exit 1
  fi
  docker exec -i -e MYSQL_PWD="$ROOT_DB_PASSWORD" "$DB_CONTAINER" \
    mysql -uroot "$DB_NAME" <"$NEXT_DIR/database/schema.sql"
fi
runuser -u kotoba -- npm test
runuser -u kotoba -- npm run build

mv "$APP_DIR" "$BACKUP_DIR"
mv "$NEXT_DIR" "$APP_DIR"

if systemctl restart kotoba; then
  for attempt in {1..30}; do
    if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
      echo "Kotoba update is healthy. Backup: $BACKUP_DIR"
      exit 0
    fi
    sleep 1
  done
fi

echo "Update failed; restoring $BACKUP_DIR" >&2
systemctl stop kotoba || true
mv "$APP_DIR" "${APP_DIR}.failed.$(date +%Y%m%d%H%M%S)"
mv "$BACKUP_DIR" "$APP_DIR"
systemctl start kotoba
exit 1
