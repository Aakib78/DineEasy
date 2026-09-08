# DineEasy customer web — multi-stage Dockerfile, mirrors services/api/Dockerfile's shape.
# `development` target is used by docker-compose.dev.yml (source-mounted, Vite HMR).
# `production` (default) target is what docker-compose.yml (LAN deployment) builds: a static
# build served by nginx, since this is a client-only SPA with no server-side rendering.

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install
COPY . .
# VITE_API_BASE_URL is baked into the static bundle at build time (Vite env vars are
# compile-time, not runtime) — see docs/customer-web.md. Passed through from compose/.env.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
# A client-side-routed SPA (react-router) needs every unmatched path to fall through to
# index.html — otherwise a diner reloading /menu or /orders/:id gets nginx's plain 404.
RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    location / {\n\
        try_files $uri /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
