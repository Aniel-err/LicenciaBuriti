#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "RESTORE_LICENCA_BURITI" ]; then
  echo "Restauração bloqueada. Defina CONFIRM_RESTORE=RESTORE_LICENCA_BURITI."
  exit 2
fi
if [ "$#" -ne 1 ]; then
  echo "Uso: infra/scripts/restore.sh backups/AAAAMMDDTHHMMSSZ"
  exit 2
fi

SOURCE="$1"
test -f "${SOURCE}/database.dump"
test -f "${SOURCE}/uploads.tar.gz"
(cd "$SOURCE" && sha256sum -c SHA256SUMS)

docker compose -f compose.production.yml exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "${SOURCE}/database.dump"
docker run --rm \
  -v licencia-buriti_uploads_data:/target \
  -v "$(pwd)/${SOURCE}:/backup:ro" \
  alpine:3.20 sh -c "find /target -mindepth 1 -delete && tar -xzf /backup/uploads.tar.gz -C /target"
echo "Restauração concluída."
