#!/bin/bash
# Local-only check for the v36/v37 account-deletion cleanup. Creates a throwaway database,
# applies the migrations, and drops the database. Does not talk to the live Supabase project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="fp_erase_cleanup_$$"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi
cleanup() {
  sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sudo -u postgres createdb "$DB"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/scripts/e2e/erase-cleanup/fixture.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261119120000_v36_auth_delete_cleanup.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261119140000_v37_erase_no_storage_delete.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/e2e/erase-cleanup/test.sql"
echo "erase-cleanup: all assertions passed"
