# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/utils/package.json ./packages/utils/
COPY packages/types/package.json ./packages/types/
COPY services/auth/package.json ./services/auth/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages ./packages
COPY services/auth ./services/auth

# Build
WORKDIR /app/services/auth
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built files
COPY --from=builder /app/services/auth/dist ./dist
COPY --from=builder /app/services/auth/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser
USER appuser

EXPOSE 4001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]

