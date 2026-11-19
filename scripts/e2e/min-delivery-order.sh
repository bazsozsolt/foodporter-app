#!/bin/bash
# Local-only check for the v38 delivery-order minimum. Creates a throwaway database,
# applies the migration, and drops the database. Does not talk to the live Supabase project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="fp_min_delivery_$$"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi
cleanup() {
  sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sudo -u postgres createdb "$DB"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/scripts/e2e/min-delivery-order/fixture.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261119161600_v38_min_delivery_order.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/e2e/min-delivery-order/test.sql"
echo "min-delivery-order: all assertions passed"
