# syntax=docker/dockerfile:1.7

# ─── Stage 1: build the frontend bundle ──────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app
RUN corepack enable

# Layer-cache-friendly: install deps before copying the rest of the source
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Source + build → /app/dist
COPY . .
RUN pnpm build

# ─── Stage 2: runtime image ──────────────────────────────────────────
# Hono + tsx run server/index.ts directly. tsx is a devDependency, so
# we install with --prod=false to bring it in without restructuring
# package.json.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001
RUN corepack enable && apk add --no-cache libc6-compat tini

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false && pnpm store prune

# Runtime sources — server-side TS executed by tsx
COPY server      ./server
COPY shared      ./shared
COPY tsconfig.json tsconfig.server.json ./
COPY drizzle.config.ts ./
COPY migrations  ./migrations
# (Optional) include the import script so operators can re-run it inside the container
COPY scripts    ./scripts

# Built frontend served by the same Hono process at "/"
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 3001

# Use tini as PID 1 so SIGTERM reaches the Node process and shutdown is clean
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "start"]
