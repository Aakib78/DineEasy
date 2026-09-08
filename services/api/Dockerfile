# DineEasy API — multi-stage Dockerfile
# `development` target is used by docker-compose.dev.yml (source-mounted, hot reload)
# `production` (default) target is what docker-compose.yml (LAN deployment) builds.

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
RUN npm install
RUN npx prisma generate
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 \
  CMD wget -qO- http://localhost:3000/api/v1/system/health || exit 1
CMD ["node", "dist/main.js"]
