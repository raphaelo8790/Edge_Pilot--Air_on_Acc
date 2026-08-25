#!/usr/bin/env bash
#
# EdgePilot AI — one-shot local database setup.
#
#   bash setup-db.sh
#
# Brings up the local Postgres container, applies the committed migrations,
# and seeds the provider catalog. Idempotent: safe to re-run.
#
# This script only ever touches YOUR local database. It never connects to the
# shared hosted database — that one is updated deliberately, see
# docs/internal/database.md.
#
# On Windows, run this from WSL (Ubuntu), not PowerShell.

set -euo pipefail

# --- 0. are we in the repo root? --------------------------------------------
[ -f prisma/schema.prisma ] || {
  echo "ERROR: prisma/schema.prisma not found. Run this from the repo root." >&2
  exit 1
}

# --- 1. prerequisites -------------------------------------------------------
echo "==> Checking prerequisites..."

command -v docker >/dev/null || {
  echo "ERROR: docker not found in this shell." >&2
  echo "  Docker Desktop > Settings > Resources > WSL Integration: enable your distro," >&2
  echo "  then close and reopen the terminal." >&2
  exit 1
}

command -v node >/dev/null || {
  echo "ERROR: node not found. Install Node 20+ (Node 24 is what CI uses), then retry." >&2
  exit 1
}

node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || {
  echo "ERROR: Node 20+ required (found $(node -v))." >&2
  exit 1
}

case "$(command -v node)" in
  /mnt/*)
    echo "WARNING: 'node' resolves to a Windows install ($(command -v node))."
    echo "         Install Node inside WSL to avoid path and file-watching problems."
    ;;
esac

# --- 2. .env ----------------------------------------------------------------
# The Prisma CLI reads .env — not .env.local. Both variables point at the local
# container: there is no connection pooler in front of it, so the pooled and
# direct URLs are the same string.
if [ ! -f .env ]; then
  echo "==> Creating .env for the local container"
  {
    echo 'DATABASE_URL="postgresql://EdgePilot:EdgePilotTesting@localhost:5432/edgepilot"'
    echo 'DIRECT_URL="postgresql://EdgePilot:EdgePilotTesting@localhost:5432/edgepilot"'
  } >.env
else
  echo "==> .env exists, leaving it alone (it needs BOTH DATABASE_URL and DIRECT_URL)"
  grep -q '^DIRECT_URL=' .env || {
    echo "ERROR: .env has no DIRECT_URL. Add it — same value as DATABASE_URL for local." >&2
    exit 1
  }
fi

# --- 3. dependencies --------------------------------------------------------
if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (npm ci)..."
  npm ci
else
  echo "==> node_modules present, skipping install"
fi

# --- 4. start Postgres ------------------------------------------------------
echo "==> Starting Postgres..."
docker compose up -d

echo "==> Waiting for Postgres to report healthy..."
status="starting"
for _ in $(seq 1 30); do
  cid="$(docker compose ps -q postgres 2>/dev/null || true)"
  if [ -n "$cid" ]; then
    status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
  fi
  [ "$status" = "healthy" ] && break
  sleep 2
done

if [ "$status" != "healthy" ]; then
  echo "ERROR: Postgres did not become healthy (last status: ${status:-unknown})." >&2
  echo "  Look at the logs:  docker compose logs postgres" >&2
  exit 1
fi
echo "    Postgres is healthy."

# --- 5. tables --------------------------------------------------------------
# migrate deploy applies the committed migration files and nothing else. If the
# folder is missing you are on a branch that predates migrations — create the
# first one with:  npx prisma migrate dev --name init
if [ -d prisma/migrations ]; then
  echo "==> Applying migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "ERROR: prisma/migrations/ not found." >&2
  echo "  Create the initial migration with:  npx prisma migrate dev --name init" >&2
  exit 1
fi

echo "==> Generating Prisma Client..."
npx prisma generate

# --- 6. baseline data -------------------------------------------------------
echo "==> Seeding the provider catalog..."
npx prisma db seed

cat <<'EOF'

============================================================
 Local database ready.

 Tables: users, workloads, devices, providers, benchmarks,
         benchmark_results, readiness_scores, rate_limits

 Browse it:   npx prisma studio      (http://localhost:5555)
 Stop it:     docker compose down
============================================================
EOF
