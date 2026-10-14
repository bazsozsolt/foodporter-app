#!/usr/bin/env bash
# Deploys out/ to the gh-pages worktree. Keeps older /_next/static chunks so phones that still run the previous
# build (cached HTML for ~10 min on GitHub Pages, or a PWA left open) can finish loading instead of crashing.
set -euo pipefail
W=${GHP_WORKTREE:-/tmp/ghp2}; SRC=$(cd "$(dirname "$0")/.." && pwd)/out
cd "$W"
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name _next -exec rm -rf {} +
find _next -mindepth 1 -maxdepth 1 ! -name static -exec rm -rf {} + 2>/dev/null || true
# drop chunks older than 14 days so the branch doesn't grow forever
find _next/static -type f -mtime +14 -delete 2>/dev/null || true
cp -a "$SRC/." . && touch .nojekyll
git add -A && git commit -qm "${1:-deploy}" && git push -q && git log --oneline -1
