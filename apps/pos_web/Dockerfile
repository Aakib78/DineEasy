# DineEasy POS web — multi-stage Dockerfile, mirrors apps/customer_web/Dockerfile's shape
# (see that file's header comment for the full "why a monorepo-root build context" story —
# identical reasoning applies here: this app also depends on the local npm workspace package
# packages/shared_types).
#
# `development` target is used by docker-compose.dev.yml (source-mounted, Vite HMR).
# `production` (default) target is what docker-compose.yml (LAN deployment) builds: a static
# build served by nginx, since this is a client-only SPA with no server-side rendering.

FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/pos_web/package.json ./apps/pos_web/package.json
COPY apps/customer_web/package.json ./apps/customer_web/package.json
COPY packages/shared_types/package.json ./packages/shared_types/package.json
COPY services/api/package.json ./services/api/package.json
COPY services/print-agent/package.json ./services/print-agent/package.json

# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
RUN npm install
COPY packages/shared_types ./packages/shared_types
COPY apps/pos_web ./apps/pos_web
WORKDIR /repo/apps/pos_web
EXPOSE 3001
CMD ["npm", "run", "dev", "--", "--host"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install
COPY packages/shared_types ./packages/shared_types
COPY apps/pos_web ./apps/pos_web
WORKDIR /repo/apps/pos_web
# VITE_API_BASE_URL is baked into the static bundle at build time (Vite env vars are
# compile-time, not runtime) — see docs/pos-web.md. Passed through from compose/.env.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production
COPY --from=build /repo/apps/pos_web/dist /usr/share/nginx/html
# A client-side-routed SPA (react-router) needs every unmatched path to fall through to
# index.html — otherwise a staff member reloading /billing/:orderId gets nginx's plain 404.
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    location / {\n\
        try_files $uri /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
