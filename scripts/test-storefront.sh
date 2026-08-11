#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4175}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/forma-storefront-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
sleep 1
node --check next/app-registry.js
node --check next/catalog-preprocess.js
node scripts/audit-next-finalization.mjs "http://127.0.0.1:${PORT}/next/"
node scripts/storefront-state-test.mjs "http://127.0.0.1:${PORT}/next/"
node scripts/browser-next-finalization.mjs "http://127.0.0.1:${PORT}/next/" chromium
node scripts/browser-next-finalization.mjs "http://127.0.0.1:${PORT}/next/" webkit
git diff --check
