#!/bin/sh
set -e

# No external Redis configured (e.g. Render free tier): run one inside this container.
# In-memory only: a restart drops sign-up codes, rate-limit counters and the catalog cache,
# which are all short-lived. Orders, payments and emails live in Postgres and are unaffected.
if [ -z "$REDIS_URL" ]; then
  redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no \
    --maxmemory 64mb --maxmemory-policy noeviction --dir /tmp --daemonize yes --loglevel warning
  export REDIS_URL=redis://127.0.0.1:6379
  echo "using embedded redis at $REDIS_URL"
fi

exec "$@"
