#!/bin/sh
# Download virus signatures, start clamd, keep signatures fresh, then run the worker.
set -e

echo "Updating ClamAV signatures..."
freshclam --stdout || echo "freshclam failed; using signatures already in the image (if any)"

clamd
# Wait for clamd to accept connections (up to 3 minutes while it loads signatures).
i=0
until node -e "import('./src/clamd.mjs').then((m) => m.ping({ host: '127.0.0.1', port: 3310 })).then((ok) => process.exit(ok ? 0 : 1))"; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then echo "clamd did not start"; exit 1; fi
  sleep 2
done

freshclam -d --checks=12

exec node src/index.mjs
