FROM node:20-alpine AS base
ARG PNPM_VERSION=10.33.0
RUN corepack disable 2>/dev/null || true \
  && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
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
COPY apps/api-gateway apps/api-gateway
RUN pnpm --filter @saas/api-gateway build

FROM node:20-alpine AS runtime
WORKDIR /app
# Compose overrides for local stacks; production images should set NODE_ENV=production at deploy.
ENV NODE_ENV=development

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api-gateway/node_modules ./apps/api-gateway/node_modules
COPY --from=build /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=build /app/apps/api-gateway/package.json ./apps/api-gateway/package.json

EXPOSE 4000
CMD ["node", "apps/api-gateway/dist/index.js"]
