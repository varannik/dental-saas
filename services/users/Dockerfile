# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY services/users/package.json services/users/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN pnpm install --frozen-lockfile --shamefully-hoist

FROM deps AS build
COPY services/users services/users
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/utils packages/utils
RUN pnpm --filter @saas/users build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/users/node_modules ./services/users/node_modules
COPY --from=build /app/services/users/dist ./services/users/dist
COPY --from=build /app/services/users/package.json ./services/users/package.json

EXPOSE 4002
CMD ["node", "services/users/dist/services/users/src/index.js"]
