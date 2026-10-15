#!/usr/bin/env bash
# Runs every end-to-end/RLS suite against the Supabase project using the test accounts in $FP_TEST_CREDS.
set -u; cd "$(dirname "$0")"; rc=0
for t in core group; do echo "=== $t"; node $t.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1; [ "${PIPESTATUS[0]}" = 0 ] || rc=1; done
echo "=== push"; node push.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1
echo "=== support"; node support.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1
echo "=== chat"; node chat.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1
echo "=== chat-admin"; node chat-admin.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1
echo "=== photos"; node photos.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1
for t in compliance tips hours proof pickup promo cross legal employment v20; do echo "=== $t"; node $t.e2e.mjs 2>&1 | grep -v "Node.js 20" || rc=1; [ "${PIPESTATUS[0]}" = 0 ] || rc=1; done
echo "=== manual-assign"; python3 manual-assign.ui.py "${FP_BASE:-https://bazsozsolt.github.io/foodporter-app}" || rc=1
echo "=== legal-ui"; python3 legal.ui.py "${FP_BASE:-https://bazsozsolt.github.io/foodporter-app}" || rc=1
echo "=== v19-ui"; python3 v19.ui.py "${FP_BASE:-https://bazsozsolt.github.io/foodporter-app}" || rc=1
echo "=== v20-ui"; python3 v20.ui.py "${FP_BASE:-https://bazsozsolt.github.io/foodporter-app}" || rc=1
echo "=== a11y"; python3 a11y.ui.py "${FP_BASE:-https://bazsozsolt.github.io/foodporter-app}" | tee /tmp/a11y_run.log; ! grep -qE "\((critical|serious)," /tmp/a11y_run.log || rc=1
echo "=== i18n"; node ../i18n/check-parity.mjs || rc=1
echo "=== reports"; node reports.check.mjs 2>&1 | grep -v "Node.js 20" || rc=1
echo "=== crawler (click-everything, quick; needs FP_BASE or local server)"; ./crawl-parallel.sh "${FP_BASE:-https://bazsozsolt.github.io/foodporter-app}" --quick || rc=1
exit $rc
