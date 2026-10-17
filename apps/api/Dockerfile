FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dcfoundry/api build
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
