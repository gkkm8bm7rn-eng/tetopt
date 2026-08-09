#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4174}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/forma-next-audit-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
sleep 1
node --check next/app-registry.js
node --check next/catalog-preprocess.js
node scripts/audit-next-finalization.mjs "http://127.0.0.1:${PORT}/next/"
git diff --check
