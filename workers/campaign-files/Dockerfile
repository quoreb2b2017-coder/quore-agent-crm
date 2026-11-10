# WorkTrack Campaign Operations file worker: ClamAV + the Node worker in one container.
# Deploy as a private background service (Railway or Render "background worker"); it needs no
# public port. Give it about 2 GB of memory: ClamAV keeps its signature database in RAM.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends clamav clamav-daemon ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /run/clamav && chown clamav:clamav /run/clamav

# clamd listens on localhost only. Stream limits match the 100 MB upload limit.
RUN printf '%s\n' \
  'LocalSocket /run/clamav/clamd.ctl' \
  'TCPSocket 3310' \
  'TCPAddr 127.0.0.1' \
  'StreamMaxLength 110M' \
  'MaxFileSize 110M' \
  'MaxScanSize 400M' \
  'AlertBrokenExecutables yes' \
  'AlertOLE2Macros yes' \
  'Foreground no' \
  'User clamav' \
  > /etc/clamav/clamd.conf

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
