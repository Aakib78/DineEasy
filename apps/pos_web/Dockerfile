# DineEasy POS web — multi-stage Dockerfile, mirrors apps/customer_web/Dockerfile's shape
# (see that file's header comment for the full "why a monorepo-root build context" story —
# identical reasoning applies here: this app also depends on the local npm workspace package
# packages/shared_types).
#
# `development` target is used by docker-compose.dev.yml (source-mounted, Vite HMR).
# `production` (default) target is what docker-compose.yml (LAN deployment) builds: a static
# build served by nginx, since this is a client-only SPA with no server-side rendering.
#
# `npm install` is deliberately scoped to `--workspace apps/pos_web --workspace
# packages/shared_types`, not a blanket install of the whole monorepo — this image only needs
# those two workspaces' dependencies, and only their package.json files are copied in above.
# The first real Docker build of this image (this was never actually run before — see
# docs/troubleshooting.md's port-drift/CORS entries for the same "first real run caught a real
# bug" pattern elsewhere in this project) failed here: an unscoped `npm install` also pulls in
# every *other* workspace's dependencies, including `services/print-agent`'s `usb` package (a
# native addon it needs for real USB thermal printers — see docs/printing.md), which requires
# node-gyp + a C/C++ toolchain + Python to build from source, none of which `node:20-alpine` has
# — and print-agent isn't even meant to run in Docker in the first place (docs/printing.md: "a
# standalone Node process meant to run on the restaurant's LAN", not shipped as part of any app
# image). Scoping the install is the actual fix, not adding a Python/build-tool layer just to
# satisfy a dependency this image never uses.

FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/pos_web/package.json ./apps/pos_web/package.json
COPY packages/shared_types/package.json ./packages/shared_types/package.json

# ---------------------------------------------------------------------------
FROM base AS development
ENV NODE_ENV=development
RUN npm install --workspace apps/pos_web --workspace packages/shared_types
COPY packages/shared_types ./packages/shared_types
COPY apps/pos_web ./apps/pos_web
WORKDIR /repo/apps/pos_web
EXPOSE 3001
CMD ["npm", "run", "dev", "--", "--host"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install --workspace apps/pos_web --workspace packages/shared_types
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
