# syntax=docker/dockerfile:1

# ---------------------------------------------------------------
# Stage 1 â€” install dependencies (cached until package*.json change)
# ---------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app

# Native Node modules such as argon2 may fall back to node-gyp
# on Alpine when no compatible prebuilt binary is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS prod-deps
RUN npm prune --omit=dev

# ---------------------------------------------------------------
# Stage 2 â€” build
#
# NEXT_PUBLIC_* values are inlined into the client bundle at build
# time, so they must be provided as build args (docker-compose.yml
# forwards them from .env.local). Server-only secrets (database URL,
# ENCRYPTION_KEY, META_APP_SECRET, ...) are read at runtime and
# must NOT be baked into the image.
# ---------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_APP_LOCALE=en
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_LOCALE=$NEXT_PUBLIC_APP_LOCALE \
    NEXT_TELEMETRY_DISABLED=1

# Build-time placeholder only.
# Next.js evaluates server route modules while collecting route data.
# Runtime DATABASE_URL is supplied by docker-compose.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

RUN npm run build

# ---------------------------------------------------------------
# Stage 3 â€” minimal runtime (standalone output)
# ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

COPY --from=builder --chown=nextjs:nextjs /app/scripts/voice-events-worker.mjs ./scripts/voice-events-worker.mjs
COPY --from=builder --chown=nextjs:nextjs /app/scripts/automation-worker.mjs ./scripts/automation-worker.mjs
COPY --from=builder --chown=nextjs:nextjs /app/scripts/broadcast-worker.mjs ./scripts/broadcast-worker.mjs
COPY --from=builder --chown=nextjs:nextjs /app/scripts/google-calendar-worker.mjs ./scripts/google-calendar-worker.mjs
COPY --from=builder --chown=nextjs:nextjs /app/scripts/ai-worker.mjs ./scripts/ai-worker.mjs
COPY --from=prod-deps --chown=nextjs:nextjs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]







