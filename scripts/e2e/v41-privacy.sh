#!/bin/bash
# Local-only check for the v41 privacy/captcha migration. Creates a throwaway
# database with the live-main (v40) schema plus v41, and drops it afterwards.
# Does not talk to the live project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="fp_v41_privacy_$$"
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required" >&2
  exit 1
fi
cleanup() {
  sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT
sudo -u postgres createdb "$DB"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/scripts/e2e/v40-security-review/fixture.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/scripts/e2e/v41-privacy/extra.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261121020000_v40_security_review.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/migrations/20261121050000_v41_privacy_captcha.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/scripts/e2e/v41-privacy/test.sql"
echo "v41-privacy: all assertions passed"
