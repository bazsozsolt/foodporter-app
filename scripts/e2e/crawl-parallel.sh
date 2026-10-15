#!/usr/bin/env bash
# Runs the crawler per role, at most $CRAWL_CONCURRENCY (default 1, max 2) browsers at a time so the box is not overloaded.
# Usage: crawl-parallel.sh [base] [--mobile|--quick]
cd "$(dirname "$0")"; rc=0; C=${CRAWL_CONCURRENCY:-1}; [ "$C" -gt 2 ] && C=2
roles=(anon customer rider restaurant admin admin-as-roles); running=()
for r in "${roles[@]}"; do
  python3 -u crawl.ui.py "$@" --role=$r > /tmp/crawl_$r.log 2>&1 & running+=($!)
  if [ ${#running[@]} -ge "$C" ]; then for p in "${running[@]}"; do wait $p || rc=1; done; running=(); pkill -f chrome-headless-shell 2>/dev/null; fi
done
for p in "${running[@]}"; do wait $p || rc=1; done; pkill -f chrome-headless-shell 2>/dev/null
for r in "${roles[@]}"; do cat /tmp/crawl_$r.log; done; exit $rc
