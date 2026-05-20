FROM node:20-alpine AS base
# Install pnpm via npm — Corepack’s lazy download of pnpm often fails in Docker/CI
# (TLS ECONNRESET to registry.npmjs.org). Keep version in sync with root package.json "packageManager".
ARG PNPM_VERSION=10.33.0
RUN corepack disable 2>/dev/null || true \
  && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
# Frozen lockfile requires every workspace importer in pnpm-lock.yaml to have package.json on disk.
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY apps/web/package.json apps/web/package.json
COPY services/auth/package.json services/auth/package.json
COPY services/clinical/package.json services/clinical/package.json
COPY services/users/package.json services/users/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN pnpm install --frozen-lockfile --shamefully-hoist

FROM deps AS build
COPY services/clinical services/clinical
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/utils packages/utils
RUN pnpm --filter @saas/config build && pnpm --filter @saas/clinical build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/clinical/node_modules ./services/clinical/node_modules
COPY --from=build /app/packages/config ./packages/config
COPY --from=build /app/services/clinical/dist ./services/clinical/dist
COPY --from=build /app/services/clinical/package.json ./services/clinical/package.json

EXPOSE 4003
CMD ["node", "services/clinical/dist/index.js"]
