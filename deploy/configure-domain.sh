#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/kotoba}
DOMAIN=${1:-loken-loki.cn}
ENV_FILE="$APP_DIR/.env"
TEMP_ENV=$(mktemp)

cleanup() {
  rm -f "$TEMP_ENV"
}
trap cleanup EXIT

if [[ $EUID -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing production environment: $ENV_FILE" >&2
  exit 1
fi

upsert_env() {
  local key=$1
  local value=$2

  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "$ENV_FILE" > "$TEMP_ENV"

  install -o kotoba -g kotoba -m 0600 "$TEMP_ENV" "$ENV_FILE"
}

upsert_env API_HOST 127.0.0.1
upsert_env API_PORT 8080
upsert_env APP_ORIGINS "https://$DOMAIN,https://www.$DOMAIN"
upsert_env APP_PUBLIC_URL "https://$DOMAIN"
upsert_env COOKIE_SECURE true
upsert_env TRUST_PROXY true

systemctl restart kotoba

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
    break
  fi
  sleep 1
done

curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null

if systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --remove-port=8080/tcp >/dev/null || true
  firewall-cmd --reload >/dev/null
fi

echo "Kotoba now accepts public traffic through https://$DOMAIN only."
