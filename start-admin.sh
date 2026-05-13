#!/bin/bash
# Start the admin server. Reads ADMIN_PASSWORD from .env if present.
# Run this from a terminal and KEEP THE TERMINAL OPEN.
# To stop: Ctrl+C in the terminal, or run `lsof -ti :4000 | xargs kill`

cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Sensible defaults
: "${ADMIN_PASSWORD:=admin}"
: "${ADMIN_PORT:=4000}"

# Kill any prior instance silently
PRIOR=$(lsof -ti :$ADMIN_PORT 2>/dev/null | head -1)
if [ -n "$PRIOR" ]; then
  echo "Stopping prior instance on port $ADMIN_PORT (pid $PRIOR)…"
  kill "$PRIOR" 2>/dev/null
  sleep 1
fi

echo "Starting admin server on port $ADMIN_PORT…"
ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_PORT="$ADMIN_PORT" exec node admin/server.js
