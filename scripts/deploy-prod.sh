#!/usr/bin/env bash
# Deploy de producción (lo invoca .github/workflows/deploy-prod.yml por SSH,
# después de hacer git reset a origin/main en el VPS).
#
# Pasos: instala deps -> backup idempotente de la DB -> migración idempotente -> restart pm2.
#
# Env esperadas:
#   PM2_NAME   nombre o id del proceso pm2 del backend (default: controlalo-ba)
# Las credenciales de DB se leen del .env de prod del proyecto (no se duplican en GitHub).
set -euo pipefail

PM2_NAME="${PM2_NAME:-controlalo-ba}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "==> Instalando dependencias (producción)"
npm install --production --no-audit --no-fund

echo "==> Backup de la base de datos"
# Extrae solo las DB_* del .env (evita sourcear todo el archivo).
get_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '\r'; }
DB_HOST="$(get_env DB_HOST)"
DB_USERNAME="$(get_env DB_USERNAME)"
DB_PASSWORD="$(get_env DB_PASSWORD)"
DB_DATABASE="$(get_env DB_DATABASE)"

if command -v mysqldump >/dev/null 2>&1 && [ -n "$DB_DATABASE" ]; then
  mkdir -p backups
  STAMP="$(date +%Y%m%d_%H%M%S)"
  BACKUP="backups/db_${STAMP}.sql"
  mysqldump -h "$DB_HOST" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" > "$BACKUP"
  gzip "$BACKUP"
  echo "    backup -> ${BACKUP}.gz"
  # Conservar solo los últimos 7 backups.
  ls -1t backups/db_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
else
  echo "    ⚠ mysqldump no disponible o DB_DATABASE vacío — se omite backup"
fi

echo "==> Migración idempotente"
NODE_ENV=production npm run migrate:prod:latest

echo "==> Restart pm2 ($PM2_NAME)"
pm2 restart "$PM2_NAME" --update-env || pm2 start app.js --name "$PM2_NAME" --update-env
pm2 save || true

echo "==> Deploy OK"
