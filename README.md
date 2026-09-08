# DineEasy

**Run your restaurant, effortlessly.**

DineEasy is a restaurant operating system for independent restaurants, cafés and QSRs in India (starting with Delhi and Faridabad). It runs POS, tables, kitchen (KOT/KDS), billing, payments and QR ordering from a single system — and it keeps working on the restaurant's local network even when the internet goes down.

This repository is under active vertical-slice development (see `docs/architecture.md` §"Build status" for what's implemented vs. planned). It is a real, runnable foundation — not a mockup.

## Monorepo layout

```
dineeasy/
├── apps/
│   ├── restaurant_app/     # Flutter staff app (POS, tables, KDS, admin) — Android + Windows
│   └── customer_web/       # Customer QR ordering PWA (Vite + React + TS)
├── services/
│   └── api/                 # NestJS + TypeScript backend API
├── packages/
│   └── shared_types/         # @dineeasy/shared-types — TS types for apps/customer_web
├── infrastructure/
│   └── docker/               # docker-compose files for local/dev/test/prod-like deployment
├── docs/                      # Architecture & operational documentation
└── scripts/                   # Dev/setup scripts
```

## Quick start (development)

```bash
git clone git@github.com-personal:Aakib78/DineEasy.git
cd DineEasy
cp .env.example .env

# Start Postgres + Redis (and, once built, the API + web) via Docker
npm run docker:up

# Install dependencies
npm install

# Run database migrations + seed demo data
npm run --workspace services/api prisma:migrate
npm run --workspace services/api seed

# Start the API in watch mode
npm run dev:api

# In another terminal, start the customer PWA (see docs/customer-web.md)
cp apps/customer_web/.env.example apps/customer_web/.env.local
npm run dev:web
```

Then run the Flutter app (first time only, generates the platform folders — see `docs/flutter-app.md`):

```bash
cd apps/restaurant_app
flutter create . --platforms=android,windows --org com.dineeasy
flutter pub get
flutter run -d windows   # or -d <android-device-id>
```

See `docs/local-development.md` for the full walkthrough, `docs/flutter-app.md`/`docs/customer-web.md` for what's implemented in each frontend so far, and `docs/troubleshooting.md` if something doesn't come up.

## Why DineEasy is different

Most restaurant software assumes the internet is always on. DineEasy doesn't. The DineEasy server (API + PostgreSQL + Redis) is designed to run **inside the restaurant's own LAN**, on a small on-site machine or a back-office PC, via Docker. POS, tables, menu, KOT, KDS, billing and local QR ordering all keep working with the internet cable unplugged. Only online payments, cloud backup and remote administration need the internet — and DineEasy is explicit in the UI when those are unavailable rather than failing silently.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system architecture, domain model, build status
- [`docs/database.md`](docs/database.md) — schema, migrations, entity relationships
- [`docs/api.md`](docs/api.md) — REST API conventions and endpoints
- [`docs/authentication.md`](docs/authentication.md) — auth, sessions, RBAC
- [`docs/offline-mode.md`](docs/offline-mode.md) — LAN-first / offline architecture
- [`docs/qr-ordering.md`](docs/qr-ordering.md) — table QR + customer ordering flow
- [`docs/payments.md`](docs/payments.md) — payment provider abstraction
- [`docs/printing.md`](docs/printing.md) — KOT/receipt printer integration architecture
- [`docs/local-development.md`](docs/local-development.md) — dev environment setup
- [`docs/deployment.md`](docs/deployment.md) — LAN deployment guide
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common issues

## License

Proprietary — © DineEasy. All rights reserved.
