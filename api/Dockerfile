# syntax=docker/dockerfile:1
# Build context is the monorepo root (see docker-compose.yml).

FROM node:22-slim AS build
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci -w api --include-workspace-root
COPY tsconfig.base.json ./
COPY api/ api/
RUN npm run build -w api

FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
COPY e2e/package.json e2e/
# Installs production dependencies only. The Prisma CLI (a dependency) runs migrations on start.
RUN npm ci -w api --omit=dev
COPY api/prisma api/prisma
COPY api/prisma.config.ts api/
COPY api/docker-entrypoint.sh api/
COPY --from=build /app/api/dist api/dist
WORKDIR /app/api
USER node
EXPOSE 4000
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
