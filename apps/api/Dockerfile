# Imagen de la API Domus IA
# Contexto de compilación: raíz del monorepo (docker compose lo define así).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @domus/domain build \
 && pnpm --filter @domus/assistant build \
 && pnpm --filter @domus/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json packages/domain/
COPY packages/assistant/package.json packages/assistant/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/packages/domain/dist packages/domain/dist
COPY --from=build /app/packages/assistant/dist packages/assistant/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/migrations apps/api/migrations

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
