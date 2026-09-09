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

Starts the Vite dev server bound to all interfaces (`--host`, baked into the `dev` script) — not just `http://localhost:5173`, but also `http://<this-machine-lan-ip>:5173`, so a phone on the same Wi-Fi can load it directly (needed to test the QR menu on a real device; see the LAN-IP note in step 7). Talks to the API via `VITE_API_BASE_URL` — see `apps/customer_web/.env.example` for overriding it from the default `http://localhost:3000/api/v1` when the phone needs the machine's LAN IP instead (again, `localhost` on a phone means the phone itself). Also make sure `.env`'s `CORS_ORIGINS` includes whatever origin the phone actually hits (`http://<lan-ip>:5173`) — see `docs/troubleshooting.md`'s "port-drift" entry for the failure mode when it doesn't.

## 6. Run the POS web app

```bash
npm run dev:pos
```

`apps/pos_web` — a second, separate Vite + React app (not a mode/route of `apps/customer_web`) for staff to take orders, bill, and take payment from any browser: a counter machine, a shared tablet, or the same laptop the API runs on. See `docs/pos-web.md` for what it covers and how it relates to the Flutter app (step 7) — short version: this app and the Flutter app are two independent clients of the same staff API, either one is a complete way to run the floor, and v1 doesn't try to keep them feature-identical (Flutter is intended for a dedicated handheld/tablet; this is for "just open a browser").

Also bound to all interfaces (`--host`) and fixed to port 3001 — chosen because `.env.example`'s `CORS_ORIGINS` has allow-listed `http://localhost:3001` since before this app existed. Talks to the API via `VITE_API_BASE_URL`, same convention as customer web (`apps/pos_web/.env.example`); reaching it from a second device on the LAN (a tablet at the counter, not the machine running the API) needs the same two changes customer web's LAN-IP note above describes — `VITE_API_BASE_URL` pointed at the API machine's LAN IP, and that device's actual origin (`http://<lan-ip>:3001`) added to `.env`'s `CORS_ORIGINS`.

Demo login: any of the accounts in step 9 below work (a Cashier or Waiter account matches this app's actual feature set most closely — Owner/Manager also work, they just carry permissions this app never exercises, like staff management).

## 7. Run the Flutter staff app

This repo intentionally doesn't commit `android/`/`windows/` — they're Flutter-SDK-version-specific generated scaffolding (see "Why there's no `android/`, `ios/`, or `windows/` folder here" in `docs/flutter-app.md`). Generate them once, on whatever machine has the Flutter SDK:

```bash
cd apps/restaurant_app
flutter create . --platforms=android,windows --org com.dineeasy
flutter pub get
flutter run -d windows      # or: flutter devices, then -d <android-device-id>
```

There's no in-app "find/set the server" screen yet (`lib/core/config/app_config.dart` documents this honestly — it's a planned follow-up, see `docs/offline-mode.md` for how LAN discovery is meant to work once implemented). Point the app at your API with a `--dart-define` at launch instead:

```bash
flutter run -d windows --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Running on a physical Android device/tablet rather than an emulator on the same machine, use your machine's actual LAN IP instead of `localhost` (a device can't reach your host machine's "localhost" — that resolves to the device itself), e.g. `--dart-define=API_BASE_URL=http://192.168.1.50:3000/api/v1`. Both devices need to be on the same LAN/Wi-Fi (not a guest network with client isolation — see `docs/deployment.md`).

## 8. Run the print agent (optional — only needed if you have a network thermal printer)

```bash
cd services/print-agent
cp .env.example .env
# edit .env: PRINT_AGENT_EMAIL/PASSWORD for a staff account scoped to one outlet with only
# the "printers.manage" permission (create it via the Staff screen first), and confirm
# PRINT_AGENT_API_BASE_URL points at your running API from step 4
npm run build && npm start        # or `npm run dev` to skip the build step
```

Everything else in DineEasy works without this — orders, billing, and KOTs all function normally with no printer configured; jobs just queue up unconsumed until an agent drains them. See `services/print-agent/README.md` for the full setup (registering a `Printer` first) and what it does and doesn't cover.

## 9. Demo login

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

- **Reset the dev database**: `npm run --workspace services/api prisma:migrate:dev -- --name reset` then re-seed, or simpler: `npm run docker:down -- -v && npm run docker:up` to wipe volumes entirely. (Prefer the `npm run docker:*` scripts over typing `docker compose ...` by hand — they already carry `--env-file .env`, which a bare `docker compose -f ... down` silently drops; see `docs/troubleshooting.md`.)
- **Inspect the DB**: `npm run --workspace services/api prisma:studio`, or `psql $DATABASE_URL`.
- **Full dockerized parity check**: `npm run docker:prod` builds and runs api+web+postgres+redis exactly as a restaurant's on-site server would, useful before a release.
