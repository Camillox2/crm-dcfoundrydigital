FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile=false

COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/api ./apps/api

RUN pnpm --filter @dcfoundry/api build

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
