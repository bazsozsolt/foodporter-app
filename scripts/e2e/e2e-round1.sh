#!/bin/bash
# Local-only SQL check for v39 stale-assignment helpers. Creates a throwaway
# database and drops it. Does not talk to the live Supabase project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="fp_e2e_round1_$$"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi
cleanup() {
  sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sudo -u postgres createdb "$DB"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/scripts/e2e/e2e-round1/fixture.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/e2e/e2e-round1/test.sql"
echo "e2e-round1 sql: all assertions passed"
