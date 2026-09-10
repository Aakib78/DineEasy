# DineEasy customer web — multi-stage Dockerfile, mirrors services/api/Dockerfile's shape.
# `development` target is used by docker-compose.dev.yml (source-mounted, Vite HMR).
# `production` (default) target is what docker-compose.yml (LAN deployment) builds: a static
# build served by nginx, since this is a client-only SPA with no server-side rendering.
#
# IMPORTANT: the build context for this image is the monorepo root (`../..` from
# infrastructure/docker/, see docker-compose.yml/docker-compose.dev.yml), not this directory.
# This app depends on the local npm workspace package packages/shared_types
# (@dineeasy/shared-types, version "*" — never published to any registry), and npm can only
# resolve a workspace package when the workspace root and every member's package.json are
# visible in the same `npm install` — with only this directory as context, `npm install`
# instead tried to fetch @dineeasy/shared-types from the public registry and failed with a
# 404. See docs/troubleshooting.md for the full story; this was the first time this image
# was ever actually built (Docker Hub is blocked in the sandbox this repo was scaffolded in,
# so only `docker compose config` had been validated before this).
#
# `npm install` is deliberately scoped to `--workspace apps/customer_web --workspace
# packages/shared_types`, not a blanket install of the whole monorepo — this image only needs
# those two workspaces' dependencies, and only their package.json files are copied in above.
# The first real end-to-end `docker compose up` (this Dockerfile builds, but had never actually
# been run through `docker:up`/`dev:all` before) caught a second real bug here: an unscoped
# `npm install` also pulls in every *other* workspace's dependencies, including
# `services/print-agent`'s `usb` package (a native addon for real USB thermal printers — see
# docs/printing.md), which requires node-gyp + a C/C++ toolchain + Python to build from source,
# none of which `node:20-alpine` has — and print-agent isn't even meant to run in Docker
# (docs/printing.md: "a standalone Node process meant to run on the restaurant's LAN", not
# shipped as part of any app image). Scoping the install is the actual fix, not adding a
# Python/build-tool layer just to satisfy a dependency this image never uses. Mirrored in
# apps/pos_web/Dockerfile, which hit the identical failure the same way.

FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/customer_web/package.json ./apps/customer_web/package.json
COPY packages/shared_types/package.json ./packages/shared_types/package.json

# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
RUN npm install --workspace apps/customer_web --workspace packages/shared_types
COPY packages/shared_types ./packages/shared_types
COPY apps/customer_web ./apps/customer_web
WORKDIR /repo/apps/customer_web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install --workspace apps/customer_web --workspace packages/shared_types
COPY packages/shared_types ./packages/shared_types
COPY apps/customer_web ./apps/customer_web
WORKDIR /repo/apps/customer_web
# VITE_API_BASE_URL is baked into the static bundle at build time (Vite env vars are
# compile-time, not runtime) — see docs/customer-web.md. Passed through from compose/.env.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production
COPY --from=build /repo/apps/customer_web/dist /usr/share/nginx/html
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
