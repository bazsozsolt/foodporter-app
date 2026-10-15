#!/usr/bin/env bash
# Runs the crawler with one process per role in parallel. Usage: crawl-parallel.sh [base] [--mobile|--quick]
cd "$(dirname "$0")"; rc=0; pids=()
for r in anon customer rider restaurant admin admin-as-roles; do python3 -u crawl.ui.py "$@" --role=$r > /tmp/crawl_$r.log 2>&1 & pids+=($!); done
for p in "${pids[@]}"; do wait $p || rc=1; done
for r in anon customer rider restaurant admin admin-as-roles; do cat /tmp/crawl_$r.log; done; exit $rc
