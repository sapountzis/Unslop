# backend/Dockerfile
FROM oven/bun:1.3.8 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS release
COPY --from=install /app/node_modules ./node_modules
COPY . .

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations on startup, then start server
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/index.ts"]
