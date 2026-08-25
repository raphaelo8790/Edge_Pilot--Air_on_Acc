# EdgePilot AI — application image.
#
# Multi-stage, so the runtime image contains the built application and nothing
# else: no source, no dev dependencies, no build toolchain, and no .env.
#
# Build:  docker build -t edgepilot-ai .
# Run:    docker compose --profile app up -d
#
# The image is NEVER given a secret at build time. Provider keys arrive as
# runtime environment variables (docker compose passes them from your .env), so
# no layer of this image contains a credential and the image is safe to push.

# ---- Stage 1: dependencies --------------------------------------------------
# Separate from the build stage so a source-only change does not re-run
# npm ci — Docker reuses this layer whenever the lockfile is unchanged.
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# openssl: Prisma's query engine links against it and the slim image omits it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# `npm ci` installs exactly the lockfile — a reproducible install, which is the
# point of committing package-lock.json.
RUN npm ci

# ---- Stage 2: build ---------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Prisma client is generated code; it must exist before `next build` type
# checks anything that imports @prisma/client.
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ---- Stage 3: runtime -------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `output: 'standalone'` (next.config.mjs) produces a server.js plus the traced
# subset of node_modules. static/ and public/ are not traced and are copied
# alongside it.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Create public directory BEFORE switching to node user
RUN mkdir -p ./public && chown node:node ./public
COPY --from=builder --chown=node:node /app/public ./public

# Migrations and the schema travel with the image so an operator can run
# `npx prisma migrate deploy` against the container's own copy.
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Run as a non-root user. The node image already provides uid/gid 1000 as
# `node`; nothing in the application needs to write to its own image.
USER node

EXPOSE 3000

# No curl or wget in the slim image; node is already here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/providers').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
