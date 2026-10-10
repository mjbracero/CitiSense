#!/usr/bin/env bash
# Restore a CitiSense backup archive into a NEW PostgreSQL / Supabase database.
#
# Usage:
#   TARGET_DB_URL="postgresql://..." ./scripts/restore.sh citisense-20261010-020000.tar.gz
#
# Then upload the photos:
#   TARGET_SUPABASE_URL=... TARGET_SERVICE_ROLE_KEY=... \
#     node scripts/restore-storage.mjs ./restore-work/storage
set -euo pipefail

ARCHIVE="${1:?Usage: TARGET_DB_URL=... ./scripts/restore.sh <backup.tar.gz>}"
: "${TARGET_DB_URL:?Set TARGET_DB_URL to the database you are restoring into}"
WORK_DIR="${WORK_DIR:-./restore-work}"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

echo "==> Backup manifest"
cat "$WORK_DIR/manifest.json"

echo "==> Restoring auth users (login accounts)"
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=0 -q -f "$WORK_DIR/db-auth-users.sql"

echo "==> Restoring public schema (tables, data, functions, triggers, RLS)"
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$TARGET_DB_URL" "$WORK_DIR/db-public.dump" || true

echo "==> Done. Photos are in $WORK_DIR/storage — run restore-storage.mjs next."
