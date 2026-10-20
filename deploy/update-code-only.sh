#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/kotoba
ARCHIVE=/tmp/kotoba-update.tar.gz
NEXT_DIR="${APP_DIR}.next.$$"
BACKUP_DIR="${APP_DIR}.backup.$(date +%Y%m%d%H%M%S)"

cleanup() {
  rm -rf "$NEXT_DIR"
  rm -f "$ARCHIVE"
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
runuser -u kotoba -- npm test
runuser -u kotoba -- npm run build

mv "$APP_DIR" "$BACKUP_DIR"
mv "$NEXT_DIR" "$APP_DIR"

if systemctl restart kotoba; then
  for attempt in {1..30}; do
    if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
      echo "Kotoba code-only update is healthy. Backup: $BACKUP_DIR"
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
