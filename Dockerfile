# Practice Sheets — production image.
# Multi-stage: install deps, build the standalone server bundle, then a
# slim runtime that carries only the bundle plus the server-read data
# folders (book data, teacher portraits, Pi config) that Next's file
# tracing cannot see because the code reads them by path at runtime.
FROM node:24-bookworm-slim AS base

# ---------------------------------------------------------------- deps
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------- build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public Supabase values are baked into the client bundle at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ------------------------------------------------------------- runtime
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Runtime-read data (paths are resolved from process.cwd() in the code).
COPY --from=builder --chown=node:node /app/lib/server/book-data ./lib/server/book-data
COPY --from=builder --chown=node:node /app/lib/server/teachers ./lib/server/teachers
COPY --from=builder --chown=node:node /app/lib/server/pi ./lib/server/pi
# Guidance-image disk cache; compose mounts a volume over this.
RUN mkdir -p /app/.guidance-image-cache && chown node:node /app/.guidance-image-cache

USER node
EXPOSE 3000
CMD ["node", "server.js"]
