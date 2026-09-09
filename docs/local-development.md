# Local development

## Prerequisites

- Node.js ≥ 20, npm ≥ 10
- Docker + Docker Compose (for Postgres/Redis; optionally the whole stack)
- Flutter SDK (stable channel) + platform toolchains for whichever target you're building (Android SDK, or Windows/Visual Studio build tools) — see `apps/restaurant_app/README.md` once that app is scaffolded
- `psql` client (optional, handy for inspecting the DB directly)

## 1. Clone and configure

```bash
git clone git@github.com-personal:Aakib78/DineEasy.git
cd DineEasy
cp .env.example .env
```

Edit `.env` if you need non-default ports, or want to point `DATABASE_URL`/`REDIS_URL` somewhere other than the bundled Docker services.

## 2. Start Postgres + Redis

```bash
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis
```

Most day-to-day development runs the API and web app on the host (steps 4–5) against just these two dockerized services, since that gives you fast rebuilds and normal debugger attachment — naming `postgres redis` explicitly skips building the `api`/`web` images entirely.

`npm run docker:up` (no service names) brings up the *whole* stack — `api` and `web` too, each built from scratch — which is only worth the wait for a full dockerized-parity check (see "Full dockerized parity check" below); don't reach for it just to unblock steps 3–5, and expect it to take a minute or two the first time.

## 3. Install dependencies and set up the database

```bash
npm install                                    # installs all workspaces (root, services/api, apps/customer_web, packages/shared_types)
npm run --workspace services/api prisma:generate
npm run --workspace services/api prisma:migrate:dev
npm run --workspace services/api seed
```

> If `prisma:generate`/`prisma:migrate:dev` fail with a 403 from `binaries.prisma.sh`, see `docs/troubleshooting.md` — this happens in networks that block that host, not on a normal internet connection.

## 4. Run the API

```bash
npm run dev:api
```

Starts NestJS in watch mode on `http://localhost:3000` (`API_PORT` in `.env`). Health check: `curl http://localhost:3000/api/v1/system/health`.

## 5. Run the customer web PWA

```bash
npm run dev:web
```

Starts the Vite dev server (default `http://localhost:5173`), talking to the API via `VITE_API_URL`.

## 6. Run the Flutter staff app

```bash
cd apps/restaurant_app
flutter pub get
flutter run -d windows      # or: flutter devices, then -d <android-device-id>
```

On first run, point it at your dev API (Settings → Server Connection → `http://localhost:3000`, or your machine's LAN IP if running on a physical Android device/tablet). See `docs/offline-mode.md` for how LAN discovery is meant to work once implemented.

## 7. Run the print agent (optional — only needed if you have a network thermal printer)

```bash
cd services/print-agent
cp .env.example .env
# edit .env: PRINT_AGENT_EMAIL/PASSWORD for a staff account scoped to one outlet with only
# the "printers.manage" permission (create it via the Staff screen first), and confirm
# PRINT_AGENT_API_BASE_URL points at your running API from step 4
npm run build && npm start        # or `npm run dev` to skip the build step
```

Everything else in DineEasy works without this — orders, billing, and KOTs all function normally with no printer configured; jobs just queue up unconsumed until an agent drains them. See `services/print-agent/README.md` for the full setup (registering a `Printer` first) and what it does and doesn't cover.

## 8. Demo login

The seed script (step 3) creates:

| Role | Email | Password |
|---|---|---|
| Owner | owner@dineeasy-demo.test | DemoPass123! |
| Manager | manager@dineeasy-demo.test | DemoPass123! |
| Cashier | cashier@dineeasy-demo.test | DemoPass123! |
| Waiter | waiter@dineeasy-demo.test | DemoPass123! |
| Kitchen | kitchen@dineeasy-demo.test | DemoPass123! |

These are **development-only** credentials seeded into a local database — never used in any deployed environment.

## Running tests

```bash
npm run --workspace services/api test         # unit tests
npm run --workspace services/api test:e2e      # e2e (needs docker:test stack running)
```

See `docs/architecture.md` §15 for current test coverage status.

## Common workflows

- **Reset the dev database**: `npm run --workspace services/api prisma:migrate:dev -- --name reset` then re-seed, or simpler: `docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.dev.yml down -v && npm run docker:up` to wipe volumes entirely.
- **Inspect the DB**: `npm run --workspace services/api prisma:studio`, or `psql $DATABASE_URL`.
- **Full dockerized parity check**: `npm run docker:prod` builds and runs api+web+postgres+redis exactly as a restaurant's on-site server would, useful before a release.
