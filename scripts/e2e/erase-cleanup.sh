#!/bin/bash
# Local-only check for account-deletion cleanup on a live-shaped (v41) schema.
# Creates a throwaway database, applies v36–v41, and drops the database.
# Does not talk to the live Supabase project.
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
# Bring the slim fixture up to the live v41 shape, then apply later migrations.
# v40b (internal callers / Vault) is skipped: it needs vault.decrypted_secrets and
# does not change erasure, commission, or credit-reason behaviour.
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/scripts/e2e/erase-cleanup/v38_v41_extra.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261119161600_v38_min_delivery_order.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261120220000_v39_e2e_round1.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261121020000_v40_security_review.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261121050000_v41_privacy_captcha.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/e2e/erase-cleanup/test.sql"
echo "erase-cleanup: all assertions passed"
