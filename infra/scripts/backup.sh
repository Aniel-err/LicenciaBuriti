#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/${STAMP}"

mkdir -p "$TARGET"
docker compose -f compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "${TARGET}/database.dump"
docker run --rm \
  -v licencia-buriti_uploads_data:/source:ro \
  -v "$(pwd)/${TARGET}:/backup" \
  alpine:3.20 sh -c "cd /source && tar -czf /backup/uploads.tar.gz ."
sha256sum "${TARGET}/database.dump" "${TARGET}/uploads.tar.gz" > "${TARGET}/SHA256SUMS"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf -- {} +
printf 'Backup concluido em %s\n' "$TARGET"
