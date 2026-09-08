# DineEasy Architecture

## 1. System overview

DineEasy is a single deployable backend (NestJS API + PostgreSQL + Redis) that serves three clients:

- **Restaurant app (Flutter)** — staff-facing: POS, tables, KDS, menu/staff admin. Android + Windows.
- **Customer QR web (Vite/React PWA)** — guest-facing: scan table QR → menu → order → track. No account required.
- **Admin/reporting** — v1 ships owner/manager reporting inside the Flutter app rather than a separate web admin, to avoid building and maintaining a fourth UI before the operational core is solid. A browser-based admin is a natural P2 addition once the API is stable, and nothing in the API is Flutter-specific.

All three talk to the same versioned REST API (`/api/v1/...`) plus a WebSocket gateway for real-time events. There is one source of truth: PostgreSQL. Redis is used for short-lived state (rate limiting, WebSocket pub/sub fan-out across API replicas, idempotency keys) — it is not the system of record, so a Redis restart never loses an order.

```
                         RESTAURANT LAN
                            Router
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        Flutter POS      Flutter KDS     Customer phone
        (staff Wi-Fi)     (staff Wi-Fi)    (guest Wi-Fi)
              │               │               │
              └───────────────┬───────────────┘
                              ▼
                    DINEEASY SERVER (Docker)
                    ┌─────────────────────┐
                    │   NestJS API (v1)    │
                    │  REST + WebSocket    │
                    └──────────┬──────────┘
                     ┌──────────┴──────────┐
                     ▼                     ▼
               PostgreSQL              Redis
             (system of record)   (cache/pubsub/rate-limit)
```

Guest Wi-Fi and staff Wi-Fi are modeled as **two SSIDs on the same router, both able to reach the DineEasy server's LAN IP/port**. This is the restaurant's network configuration, not something DineEasy manages — `docs/deployment.md` documents the requirement (guest VLAN, if used, must still route to the server) and the health screen (§12) surfaces it if the customer web can't be reached from the guest network.

## 2. Why this stack

| Concern | Choice | Why |
|---|---|---|
| Backend | NestJS + TypeScript | Modular DI architecture maps directly onto the domain module list in the spec; mature ecosystem for guards/interceptors/validation needed for RBAC, tenant isolation and idempotency. |
| ORM / migrations | Prisma | Schema-first migrations, generated types shared with DTOs, good transaction support for financial writes. Chosen over TypeORM for migration reliability and simpler raw-SQL escape hatches for report queries. |
| Database | PostgreSQL | Relational integrity for financial/tenant data, `NUMERIC` for money, strong constraint support. Runs happily on a single restaurant-grade PC. |
| Cache/realtime backbone | Redis | Idempotency key storage, WebSocket adapter (so a future multi-replica deployment fans out events correctly), rate limiting. Never the source of truth. |
| Real-time | Socket.IO (NestJS WebSocket gateway) | Auto-reconnect and room support out of the box; clients treat every event as a hint to refetch, never as the only copy of truth (§8). |
| Staff client | Flutter (Riverpod) | One codebase for Android tablets + Windows POS, per spec. Riverpod for predictable, testable state without global mutable singletons. |
| Local staff storage | Drift (SQLite) | Mature, well-tested relational local DB with reactive streams — a good fit for cached menu, active orders, and a durable sync/outbox queue (§7). |
| Customer client | Vite + React + TypeScript PWA | No app-store install, instant load on a guest phone, small bundle, installable as PWA for repeat customers. |
| Containerization | Docker Compose | Meets the "no Kubernetes, must run on a restaurant LAN PC" requirement directly. |

## 3. Multi-tenancy model

```
Organization  (the paying customer — a restaurant business)
    └── Outlet   (a physical location; v1 ships single-outlet-per-org UX but the schema supports many)
          ├── Users (staff, scoped to the org, roles scoped per outlet)
          ├── Floors → Tables → QR codes
          ├── Menu → Categories → Items → Variants / Modifier groups
          └── Orders, Dining sessions, Invoices, Payments, Audit logs
```

Every tenant-scoped table carries `organization_id` (and `outlet_id` where relevant) as a required foreign key. **The organization/outlet ID is never taken from the request body or query string for authorization purposes** — it is resolved from the authenticated JWT's claims (or, for QR customer requests, from the dining-session token) and injected by a `TenantContext` request-scoped provider. Every repository query goes through this context. This is enforced with a Prisma middleware (`prisma-tenant-guard`) that requires `organizationId` on every query against a tenant-scoped model and throws if a handler forgot to scope it — a missing tenant filter fails closed, not open.

## 4. Domain model (see `docs/database.md` for full schema)

Core aggregates:

- **Organization / Outlet / User / Role / Permission** — identity & tenancy.
- **Floor / Table / TableQrCode** — physical layout + QR identity. QR encodes an opaque signed token, never raw IDs (§ QR below).
- **DiningSession** — represents an occupancy of a table by one or more guests from QR scan to table close. Multiple guests scanning the same table QR join the same open session (§ Dining sessions below).
- **Menu / MenuCategory / MenuItem / MenuItemVariant / ModifierGroup / Modifier** — flexible catalog; availability flags read by both POS and QR.
- **Order / OrderItem / OrderItemModifier / OrderEvent** — the single order model for POS, waiter and QR origins (§ Orders below). `OrderEvent` is the audit trail of every state transition.
- **KitchenStation / KitchenOrder / KitchenOrderItem** — KOT derived from an Order, routed to one or more stations.
- **Invoice / InvoiceItem / Tax** — billing snapshot generated from an Order at bill time; immutable once issued.
- **Payment / PaymentTransaction / Refund** — provider-independent payment record (§ Payments below).
- **Printer / PrinterJob** — abstracted print queue (§ Printing below).
- **AuditLog** — generic append-only log for sensitive mutations, separate from `OrderEvent` (which is order-domain-specific and drives KOT/KDS).

## 5. Order domain — single model, state machine

POS, waiter and QR orders all create the same `Order` aggregate; the only difference is `Order.source` (`POS | WAITER | QR`) and, for QR, a `diningSessionId`. There is exactly one order state machine, implemented as a pure domain function (`services/api/src/modules/orders/domain/order-state-machine.ts`) with no framework dependencies, so it is unit-testable in isolation and cannot be bypassed from a controller:

```
DRAFT → PLACED → ACCEPTED → PREPARING → READY → SERVED → BILLED → PAID → COMPLETED
                                                              └──────────→ CANCELLED
                                                                              └──→ REFUNDED
```

Rules (enforced in the domain layer, not in UI):
- Only whitelisted transitions are allowed; any other transition throws `InvalidOrderTransitionError` (mapped to HTTP 409).
- `CANCELLED` is reachable from any pre-`PAID` state; `REFUNDED` only from `PAID`/`COMPLETED`.
- Every transition writes an `OrderEvent` row (actor, from-state, to-state, timestamp, reason) — this is what auditability and KDS "elapsed time" are built on.
- Financial fields (`subtotal`, `taxTotal`, `discountTotal`, `total`) are **recomputed server-side on every mutation** from current menu prices/tax config; the client never supplies a trusted total (§10, §14 of the spec — enforced in `OrdersService.recalculateTotals`).

## 6. Dining sessions

```
Table 12
   │
   └── DiningSession (status: OPEN)
          ├── Guest A (guestToken A) → Order #1
          ├── Guest B (guestToken B) → Order #2 (same session, same table)
          └── Guest C (guestToken C) → Order #3
```

Scanning a table QR resolves the token to `{organizationId, outletId, tableId}`, then finds-or-creates the table's currently `OPEN` `DiningSession`. Each browser tab gets a lightweight, unguessable `guestToken` (random, stored in memory + `localStorage` on the customer PWA, not tied to any personal data) so multiple phones ordering into the same session can be told apart in the POS UI without requiring login. A session closes when staff explicitly close the table (after billing) — this is a staff action, not a client-side timeout, so a dropped connection never silently loses a guest's session.

## 7. Offline / LAN-first architecture

**Server side:** the API, Postgres and Redis all run inside the restaurant LAN via Docker Compose (`infrastructure/docker/docker-compose.yml`). No core operation (auth, menu, tables, orders, KOT, KDS, billing, local QR ordering, local reports) calls out to the internet. Only `PaymentsModule` online-provider calls and future cloud-sync calls touch the internet, and both are designed to fail into a clearly-surfaced "unavailable, use offline workflow" state rather than blocking the order flow (`docs/offline-mode.md` has the full failure-mode table).

**Flutter client side:** the restaurant app is not just a thin REST client — it keeps a local Drift database mirroring what the current device needs: cached menu/config, active orders, and a **mutation outbox**. Every write (create order, update KOT status, take payment) is first written to the local outbox with a client-generated idempotency key, applied optimistically to local state, then drained to the server by a sync worker with exponential backoff. Server responses are matched back to outbox entries by idempotency key so a retried request never double-creates an order (§11 of the spec, detailed in `docs/offline-mode.md`). If the Wi-Fi drops mid-shift, staff keep working against local state; when the LAN connection to the server is lost too (not just internet), the app surfaces a clear "can't reach DineEasy server" banner rather than silently queueing forever, because unlike an internet outage, a LAN-server outage means the kitchen and other terminals are also not seeing new orders.

**Customer PWA:** requires the LAN (it talks straight to the server for menu/order placement — there is no offline order queue on the guest side, since an order that isn't visible to the kitchen isn't useful); it degrades by showing a clear "can't reach the restaurant" state with a retry rather than a blank page.

## 8. Real-time

WebSocket gateway (`OrdersGateway`, namespace `/realtime`) emits: `order.created`, `order.updated`, `order.cancelled`, `kot.created`, `kot.updated`, `kitchen.started`, `kitchen.ready`, `payment.updated`, `table.updated`. Clients join rooms scoped to `organizationId:outletId` (and kitchen clients additionally to their station) so events never cross tenants. Every event payload carries only IDs + a version/updatedAt, never a full trusted snapshot — **on receiving an event, or on reconnect, the client re-fetches the affected resource from the REST API**, so a missed or out-of-order WebSocket message can never leave a client showing stale-but-confident data. The database remains the sole source of truth; WebSockets are a "something changed, go look" signal, not a data channel.

## 9. Payments

Abstracted behind `PaymentProvider` (`services/api/src/modules/payments/domain/payment-provider.interface.ts`) with `PaymentIntent`, `PaymentTransaction`, `Refund` as domain types independent of any vendor SDK. v1 ships a `ManualPaymentProvider` (cash / UPI-shown-as-QR / card, all staff-confirmed at the POS — accurate for how most Delhi/Faridabad QSRs actually take payment today) implementing the same interface a future Razorpay/PhonePe-style provider would. Webhook endpoints (`/api/v1/payments/webhooks/:provider`) verify a provider signature, are idempotent on `providerEventId`, and only update `PaymentTransaction` status — they never trust a client-reported "payment succeeded" call (§14/§45 of the spec).

## 10. Printing

`PrintersModule` models a `Printer` (station-scoped, kitchen or receipt) and a `PrinterJob` queue (`payload`, `status: QUEUED|SENT|FAILED|ACKED`). The domain layer only ever enqueues jobs; a separate, swappable print-agent concern (v1: a raw ESC/POS-over-network sender run as part of the API for LAN printers) consumes the queue. This keeps `KitchenModule`/`BillingModule` free of any printer-vendor code — see `docs/printing.md`.

## 11. Security posture

- Argon2/bcrypt password hashing, short-lived access JWT + rotating refresh token (stored hashed, revocable per-device) — `docs/authentication.md`.
- RBAC via a `permissions` table and a `@RequirePermission('orders.cancel')` decorator/guard — never a hard-coded role string check in a handler.
- `TenantContext` guard (§3) on every tenant-scoped route.
- `class-validator` DTOs on every input; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- Rate limiting (`@nestjs/throttler` + Redis store) on auth and payment webhook routes.
- `helmet` security headers, explicit CORS allowlist from `CORS_ORIGINS`.
- All monetary math via `decimal.js` / Postgres `NUMERIC`, never native floating point.
- Structured logging (`pino`) with a request-correlation ID on every log line; secrets/tokens never logged.

## 12. Observability & supportability

Every request gets an `x-request-id` (generated if absent) threaded through logs. A `/api/v1/system/health` endpoint reports API/DB/Redis reachability; the Flutter app's Settings → System Status screen renders this plus its own local view of printer/LAN/internet connectivity — the spec's §59 health screen. `/api/v1/system/version` exposes app/API/migration versions for the versioning/compatibility requirement (§61).

## 13. Repository layout mapping

See root `README.md` for the directory tree. `packages/shared_types` holds TypeScript types generated from/aligned with the Prisma schema and OpenAPI spec, consumed by `apps/customer_web`; the Flutter app has its own Dart models (generated from the OpenAPI spec once it stabilizes — tracked in `docs/api.md`) since it's a different language runtime.

## 14. Explicit non-goals for v1

Per spec §64: no delivery marketplace, no restaurant discovery, no social features, no payroll/accounting suite, no supplier marketplace, no advanced CRM/loyalty, no reservations marketplace, no AI recommendations, no multi-country tax engine, no inventory ERP, no microservices, no Kubernetes.

## 15. Build status

This section is updated as slices land — it is the honest source of truth for "what actually works today" vs. what is designed but not yet built.

**Done:**
- Monorepo structure, `.env.example`, root docs (this file + `docs/*.md`).
- `infrastructure/docker/docker-compose.{yml,dev.yml,test.yml}`.
- Full Prisma schema (`services/api/prisma/schema.prisma`) — 39 tables, 18 enums.
- Initial migration, hand-authored (see `docs/troubleshooting.md` for why) and **validated by applying it to a real PostgreSQL 16 database** — 39 tables / 18 enum types / 56 foreign keys created with zero errors.
- `services/api` project scaffold: `package.json`, TypeScript config, ESLint/Prettier, `Dockerfile`.

- NestJS application bootstrap (`main.ts`, `AppModule`) wired with: global validation, helmet, CORS, `nestjs-pino` structured logging with request-id correlation, a global `DomainExceptionFilter`, rate limiting (`@nestjs/throttler`).
- Tenant isolation: `TenantContextStore` (AsyncLocalStorage) + `TenantContextInterceptor` + a Prisma `$use` middleware in `PrismaService` that fails closed on any tenant-scoped query missing an `organizationId`/`outletId` filter, with a narrow, grep-able `runUnscoped()` escape hatch for the handful of legitimately pre-tenant operations (login-by-email, refresh-token lookup, health checks). See `docs/architecture.md` §3.
- RBAC: `PERMISSIONS`/`SYSTEM_ROLES` catalog (`common/rbac/permissions.catalog.ts`), `RolesService` (seeds the 5 system roles + full permission catalog per organization, computes a user's effective permissions), `@RequirePermission(...)` decorator + `PermissionsGuard`, `@Public()` decorator + `JwtAuthGuard`.
- `AuthModule`: `POST /api/v1/auth/register` (creates Organization + Owner atomically — spec §68 step 1), `login`, `refresh` (rotating refresh tokens, hashed at rest), `logout`. Argon2id password hashing.
- `OrganizationsModule`, `OutletsModule` (create/list/get/update — spec §68 "Creates restaurant" → "Creates outlet"), `UsersModule` (staff CRUD + role assignment), `RolesModule` (list roles/permissions), `AuditModule` (generic audit trail wired into org/outlet/staff mutations), `SystemModule` (`/system/health`, `/system/version` — spec §59/§61).
- `prisma/seed.ts`: demo organization, 2 floors/10 tables with QR codes, GST 5% tax group, 3 menu categories / 23 items with variants and modifier groups, 5 staff accounts (one per role).
- `TaxModule` (`TaxGroup`/`TaxGroupComponent` CRUD — CGST/SGST/IGST/SERVICE_CHARGE components per spec §16), `ModifiersModule` (outlet-scoped, reusable `ModifierGroup`s, spec §12), `MenuModule` (categories, items, variants, modifier-group attachment, `getFullTree` for staff editing vs. `getPublicTree` for the QR customer view, price-change-aware audit logging).
- `TablesModule`: floors + tables CRUD, `TableQrCode` issued on table creation, in-place QR token rotation (`POST /tables/:id/qr/regenerate`) — a table has exactly one QR row (`tableId @unique`), so regenerating rotates the token rather than creating a second row, and any dining session already open on that table is unaffected.
- `DiningSessionsModule`: `DiningSessionsService` (`findOrCreateOpenSession`, `getById`, `listOpenForOutlet`, `close` — refuses to close while any order on the table is still active) + staff-facing `DiningSessionsController` (`GET /dining-sessions`, `GET /dining-sessions/:id`, `POST /dining-sessions/:id/close`, all permission-gated on `tables.view`/`tables.manage`). Sessions are never created by staff — only by a QR scan.
- Guest/QR authentication foundation: `GuestAuthModule` (`@Global()`), `GuestTokenService` (signs/verifies dining-session bearer tokens with their own `QR_TOKEN_SECRET`, deliberately isolated from the staff JWT secret, 12h TTL), `DiningSessionGuard` (verifies the guest bearer token and attaches `request.diningSession`), `@CurrentDiningSession()` param decorator. `TenantContextInterceptor` binds `isGuest: true` sessions into `TenantContextStore` exactly like a staff user, so downstream Prisma calls are scoped identically either way.
- `QrModule`: the full no-signup customer entry point (spec §4/§6/§12) — `POST /qr/:token/resolve` (`@Public()`) resolves the opaque table token (the one legitimate `TenantContextStore.runUnscoped()` use in this slice — the token *is* the tenant lookup), joins-or-creates the table's open `DiningSession`, mints a per-tab `guestToken` so multiple diners at one table each get their own session token, and returns a signed dining-session bearer token; `GET /qr/menu` (`@Public()` + `DiningSessionGuard`) serves `MenuService.getPublicTree()` for that session's outlet.
- `Dockerfile` (multi-stage dev/build/production) + `.dockerignore`.
- **The unified order domain** (spec §7/§31): `OrdersModule` — `OrdersController` (POS/Waiter) and `OrdersGuestController` (QR, dining-session-token-gated) both create/mutate the *same* `Order` model through one `OrdersService`. Covers: create (menu-validated, decimal-safe pricing via `order-pricing.util.ts`, idempotency-key-safe for offline retry), add items to a live order, cancel an item, apply one order-level discount, accept/serve/cancel, and the full state machine (`common/order/order-state-machine.ts`) gating every transition. A dine-in order auto-opens (or reuses) the table's `DiningSession`.
- **KOT/KDS**: `KitchenModule` — `OrdersService` creates a `KitchenOrder`+`KitchenOrderItem`s in the same transaction as order placement/item-add (v1 routes every KOT to a single unrouted queue — no per-menu-item station mapping exists in the schema yet, a documented gap, not a bug). `KitchenService` exposes the live queue and per-item status updates (NEW→PREPARING→READY→COMPLETED/CANCELLED), and *derives* the order's PREPARING/READY status from item progress — never a client-set flag.
- **Billing**: `BillingModule` — turns a SERVED order into an immutable `Invoice` with a recomputed CGST/SGST/IGST breakdown (`InvoiceTax`), idempotent (re-calling returns the existing invoice rather than duplicating).
- **Payments**: `PaymentsModule` — cash/UPI/card recorded by staff at the counter (`recordPayment`, supports split payment across multiple calls), auto-transitions BILLED→PAID→COMPLETED once the total is covered; a provider-webhook endpoint + `PaymentTransaction` idempotency (unique `(provider, providerEventId)`) is wired end-to-end as a scaffold for a future real gateway, even though no v1 provider calls it yet (see `ProviderWebhookDto`); basic refund initiate/approve flow.
- `common/counters/daily-counter.service.ts`: atomic, per-outlet-per-day sequential numbering (order/KOT/invoice numbers) via a Postgres `upsert` (`INSERT ... ON CONFLICT DO UPDATE`), always called inside the caller's transaction so a rolled-back order never burns a number.
- Unit tests: `order-pricing.util.spec.ts` (12 tests — modifier pricing, GST component splitting, decimal-precision, service-charge-on-post-discount-base, round-off) — **passing** in this environment, alongside the earlier 13.
- **Real-time "refetch hint" channel** (spec §8/§34): `RealtimeModule`/`RealtimeGateway` — a single in-process Socket.IO instance (no Redis adapter in v1, matching the LAN-first single-server deployment model), staff JWT or guest dining-session token verified independently at handshake, room design `outlet:<outletId>` (all staff surfaces) vs. `session:<diningSessionId>` (a guest's own session only — never the outlet-wide room). Every event is a contentless `{type, ids}` nudge, never authoritative data — `OrdersService`, `KitchenService`, and `DiningSessionsService` emit `order.updated`/`kitchen.queue_updated`/`table.updated` after their respective state changes commit.
- **Reports**: `ReportsModule` — `GET /reports/sales-summary`, `GET /reports/top-items` (Prisma `groupBy` on `OrderItem`), `GET /reports/payment-breakdown` (`groupBy` on `Payment.method`), all outlet-scoped, date-range-filterable, gated on `reports.view`.
- **Printers**: `PrintersModule` — `Printer` CRUD (network/USB, station- or outlet-scoped) and the `PrinterJob` queue (`QUEUED→SENT/FAILED→ACKED`, auto-retry up to 3 attempts, `GET /printers/:id/jobs/next` + `PATCH /printers/jobs/:jobId/status` as the contract a print agent polls). `OrdersService` enqueues a `KITCHEN` job on every KOT creation and `BillingService` enqueues a `RECEIPT` job on every invoice, both best-effort/fail-open so a missing or offline printer never blocks taking an order or billing a table. The print agent itself — ESC/POS, TCP to the printer, retry/backoff scheduling — is explicitly **not** implemented; see `docs/printing.md` for the "done vs. planned" split.
- Two pre-existing tenant-guard bugs found by code review and fixed while wiring the above: `OutletsService.update()` and `DiningSessionsService.close()` were both calling Prisma's bare `.update({where:{id}, ...})` on models in the tenant guard's org-scoped list (`Outlet`, `DiningSession`) — the guard unconditionally refuses `findUnique`/`update`/`delete` on any tenant-scoped model (Prisma's `update()` can't accept an injected `organizationId` filter in `where`), so both would have thrown at runtime. Both now use `updateMany({where:{id, organizationId}, ...})` plus a re-fetch. A full-codebase grep for every other bare `.update(`/`.findUnique(`/`.delete(` call confirmed no other call site is affected.

**Verified in this environment**, despite the Prisma engine restriction: `npx tsc --noEmit` passes with zero errors outside of Prisma's un-generated types (confirmed line-by-line — every remaining error is an implicit-`any` on a `Prisma.TransactionClient`/`Prisma.Middleware`-typed parameter, or on a value whose type chains back to one, which resolves once `prisma generate` runs); `npx eslint` is clean (zero errors); the initial migration was applied to a live Postgres 16 and matched the schema exactly (§ above); the 25 pure-logic unit tests (permissions, duration, order pricing) pass.

**In progress / not yet built:**
- Notifications module.
- `packages/shared_types`, `apps/customer_web`, `apps/restaurant_app` — directories exist, contents don't yet.
- The print agent itself (see `docs/printing.md`), OpenAPI docs generation, integration/e2e tests.
- `prisma generate` / `@prisma/client` has not been run in this environment (blocked by the same `binaries.prisma.sh` restriction as `migrate dev` — see `docs/troubleshooting.md`); the schema and migration are verified correct independent of that (§ above), and the application code has been typechecked and lint-checked as far as possible without it, but the generated TypeScript client itself — and therefore actually running the server or the Prisma-dependent test suite — needs to happen on a network that can reach Prisma's engine host (any normal developer machine; this is specifically a sandboxed-CI restriction, not a project issue).

Everything above the "Done" line in this document is the target architecture these next slices are built against, not a description of already-shipped code.
