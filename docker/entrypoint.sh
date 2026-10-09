#!/bin/sh
set -eu
# Run idempotent migrations only when starting the API, not account-management CLI.
if [ "${1:-}" = "node" ] && [ "${2:-}" = "server/index.mjs" ]; then
  node scripts/migrate.mjs
fi
exec "$@"
