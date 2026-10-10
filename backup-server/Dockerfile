# CitiSense backup API — runs on any Docker host (Render, Railway, Fly.io, a VPS).
FROM node:22-bookworm-slim

# pg_dump must be the same major version as the database (Supabase = PostgreSQL 17).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg tar \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
     -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
     > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production \
    BACKUP_DIR=/data/backups \
    PORT=8080

# Attach a persistent disk/volume at /data on the host so backups survive redeploys.
EXPOSE 8080
CMD ["node", "src/server.js"]
