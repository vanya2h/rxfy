# Build context must be the repo root (needs pnpm-lock.yaml / pnpm-workspace.yaml):
#   docker build -f apps/docs/Dockerfile -t rxfy-docs .
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json apps/docs/
RUN pnpm install --frozen-lockfile --filter docs...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/docs/node_modules ./apps/docs/node_modules
COPY apps/docs/ apps/docs/
WORKDIR /app/apps/docs
RUN pnpm build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=deps /app/apps/docs/package.json apps/docs/
RUN pnpm install --frozen-lockfile --filter docs... --prod
COPY --from=build /app/apps/docs/dist apps/docs/dist
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/apps/docs
CMD ["node", "dist/serve-node.js"]
