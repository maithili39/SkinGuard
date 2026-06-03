# SkinGuard frontend: Next.js (standalone output)
FROM node:20-slim AS builder
WORKDIR /app

# Install from package.json in the clean image. We intentionally do NOT use the
# host lockfile / `npm ci` here: the host lockfile was generated in an environment
# with a corrupted dependency tree. A fresh resolve in the clean container is
# reliable and reproducible from the pinned ranges in package.json.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
# Next.js resolves rewrites() at BUILD time, so the backend URL must be present
# now (not just at runtime). Defaults to the compose service name 'backend'.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build

# --- Runtime image (minimal) ---
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next 'standalone' output bundles only what's needed to run.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
