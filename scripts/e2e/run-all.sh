#!/usr/bin/env bash
# Runs every end-to-end/RLS suite against the Supabase project using the test accounts in $FP_TEST_CREDS.
set -u; cd "$(dirname "$0")"; rc=0
for t in core group; do echo "=== $t"; node $t.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1; [ "${PIPESTATUS[0]}" = 0 ] || rc=1; done
echo "=== reports"; node reports.check.mjs 2>&1 | grep -v "Node.js 20" || rc=1
exit $rc
