#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kotoba}"

cd "$APP_DIR"
git pull --ff-only origin main
npm ci
npm run build
sudo systemctl restart kotoba

API_PORT=$(sed -n 's/^API_PORT=//p' "$APP_DIR/.env" | head -n 1)
API_PORT=${API_PORT:-3001}

for attempt in {1..20}; do
  if curl --fail --silent "http://127.0.0.1:${API_PORT}/api/health" >/dev/null; then
    echo "Kotoba deployment is healthy."
    exit 0
  fi
  sleep 1
done

sudo journalctl -u kotoba -n 60 --no-pager
echo "Kotoba did not become healthy after restart." >&2
exit 1
