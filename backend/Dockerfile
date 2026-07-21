# ─── Krishi Raksha API — multi-stage Docker build ────────────────────────────
# Stage 1: install ALL deps (incl. dev) for the TypeScript build.
# Stage 2: compile src → dist via tsc.
# Stage 3: slim runtime with production deps only, run as non-root.
#
# Base: node:20-bookworm-slim — sharp ships prebuilt binaries for this platform,
# so no build toolchain (python/make/g++) is needed in the image.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ── production deps ──────────────────────────────────────────────────────────
# A clean install of runtime-only dependencies keeps the final image small.
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as the built-in unprivileged 'node' user, not root.
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 4000

# Liveness/readiness: the app exposes GET /api/v1/health (mongo + redis status).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
