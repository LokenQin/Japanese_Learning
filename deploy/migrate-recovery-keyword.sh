#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/kotoba
ENV_FILE="$APP_DIR/.env"
DB_CONTAINER=mysql

if [[ $EUID -ne 0 ]]; then
  echo 'Run this script as root.' >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo 'Kotoba production environment is missing.' >&2
  exit 1
fi

DB_NAME=$(sed -n 's/^DB_NAME=//p' "$ENV_FILE" | head -n 1 | tr -d '\r')
if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo 'DB_NAME in the production environment is invalid.' >&2
  exit 1
fi

read -rsp 'Current MySQL root password: ' DB_ROOT_PASSWORD
echo
trap 'unset DB_ROOT_PASSWORD' EXIT

run_mysql() {
  local sql="$1"
  printf '%s\n' "$DB_ROOT_PASSWORD" | docker exec -i "$DB_CONTAINER" sh -c '
    IFS= read -r MYSQL_PWD
    export MYSQL_PWD
    exec mysql -uroot "$1" --batch --skip-column-names -e "$2"
  ' sh "$DB_NAME" "$sql"
}

if ! run_mysql 'SELECT 1' >/dev/null 2>&1; then
  echo 'MySQL root authentication failed.' >&2
  exit 1
fi

SALT_EXISTS=$(run_mysql "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'recovery_keyword_salt'")
HASH_EXISTS=$(run_mysql "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'recovery_keyword_hash'")

if [[ "$SALT_EXISTS" == 0 ]]; then
  run_mysql 'ALTER TABLE users ADD COLUMN recovery_keyword_salt VARBINARY(32) NULL AFTER password_hash'
fi
if [[ "$HASH_EXISTS" == 0 ]]; then
  run_mysql 'ALTER TABLE users ADD COLUMN recovery_keyword_hash VARBINARY(64) NULL AFTER recovery_keyword_salt'
fi

unset DB_ROOT_PASSWORD
echo 'Recovery keyword columns are ready.'
