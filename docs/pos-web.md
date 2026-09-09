# POS web (`apps/pos_web`)

## What this is

A browser-based point-of-sale for staff: sign in, work the floor (tables + takeaway), build and
send orders to the kitchen, bill, and take payment. Vite + React + TypeScript, same stack and
conventions as `apps/customer_web` (see docs/customer-web.md), but a completely separate app —
its own workspace, its own dev server (port 3001), its own bundle. It exists alongside
`apps/restaurant_app` (the Flutter staff app, docs/flutter-app.md) rather than replacing it: both
are independent clients of the exact same staff endpoints (`OrdersController`, `TablesController`,
`MenuController`, `BillingController`, `PaymentsController` — `services/api/src/modules/*`), so a
restaurant can run either, or both at once on different terminals, with no coordination needed
beyond "the API is the one source of truth" (spec §7/§31's unified order domain — see
`orders.service.ts`'s class doc comment). v1 doesn't try to keep the two feature-identical; the
Flutter app is meant for a dedicated handheld/tablet with an installed app, this one is for "any
machine with a browser" — a shared counter terminal, a manager's laptop, a tablet propped at the
host stand.

## What's built

- **Staff auth** (`src/lib/auth/`): `POST /auth/login` → an access/refresh token pair, decoded
  client-side into `AuthUser` claims (userId, `activeOutletId`, `permissions`, name, email) —
  same trust boundary as `apps/restaurant_app/lib/core/auth/access_token_claims.dart`: no
  signature verification client-side, because verifying is `services/api`'s job on every request
  (`JwtAuthGuard`), not this app's. Tokens live in `localStorage` (not `sessionStorage` — see
  `token-storage.ts`'s doc comment: a POS terminal is a shared tab left open through a shift, and
  re-entering a password on every reload would be real friction at a busy counter). `lib/api/client.ts`
  refreshes proactively when a stored access token looks expired and reactively on a live 401,
  de-duplicating concurrent refreshes behind one in-flight promise so several screens hitting a
  stale token at once don't race each other's (single-use) refresh token into failure.
- **RBAC-gated UI** (`@dineeasy/shared-types`' `PERMISSIONS`): buttons like "Generate bill" or
  "Record payment" only render for a signed-in user whose token carries the matching permission
  — client-side gating only, exactly like the Flutter app's `Permissions` class and its own doc
  comment insists: the real enforcement is `PermissionsGuard` on the server, unconditionally, on
  every request.
- **Tables + takeaway** (`src/features/tables/TablesScreen.tsx`): floor-by-floor table grid
  (`GET /floors`, `GET /tables`) tinted by status/occupancy, a Takeaway entry point, and a live
  refresh on the realtime `table.updated`/`order.updated` hints (below) so another terminal's
  action shows up here without a manual pull — mirrors
  `apps/restaurant_app/lib/features/pos/pos_home_screen.dart`'s exact mental model.
- **Order builder** (`src/features/order/`): menu browsing (`GET /menu` — the staff full tree,
  includes unavailable items unlike the QR guest tree), a variant/modifier customize sheet
  (client-side min/max-select enforcement is UX polish; `OrdersService.priceItems` on the backend
  independently re-validates), an in-memory-only cart (deliberately not persisted — a half-built
  order surviving a reload would confuse staff more than help, see `PosCartContext.tsx`), and one
  screen handling both "start a new order" (`POST /orders`) and "add to an order already placed
  for this table" (`POST /orders/:id/items`) depending on whether `TablesScreen` found one already
  open — same design as `order_builder_screen.dart`. A `READY` order also gets a "Mark served"
  action here (`POST /orders/:id/serve`), gated on `orders.update`.
- **Billing + payments** (`src/features/billing/`): a board of orders ready to bill or awaiting
  payment (reusing `GET /orders`, filtered client-side to SERVED/BILLED/PAID — no dedicated
  endpoint exists), a detail screen to generate an invoice (`POST /orders/:id/invoice`, idempotent
  on the backend) and record one or more payments (`POST /orders/:id/payments` — split/partial
  payments are legal; the backend advances the order to PAID/COMPLETED once the running total of
  `SUCCEEDED` payments covers `total`). Mirrors `billing_screen.dart`/`billing_detail_screen.dart`
  field-for-field, including the "remaining balance" pre-fill that re-syncs after a partial
  payment without fighting an in-progress edit.
- **Realtime** (`src/lib/realtime/RealtimeContext.tsx`): one Socket.IO connection per signed-in
  session to `RealtimeGateway` (`services/api/src/common/realtime/realtime.gateway.ts`), joining
  `outlet:<activeOutletId>` server-side from the staff access token. `useRealtimeEvent(event, fn)`
  lets each screen subscribe to whichever of `order.updated`/`table.updated` it cares about.
  Exactly like every other realtime consumer in this codebase, every event is a content-free
  "something changed, go refetch" hint, never authoritative data — a screen that never sees an
  event is still correct after its next manual action or navigation, this only makes the app feel
  live sooner.
- **Wire types + RBAC catalog + client id generation, centralized** (`@dineeasy/shared-types`):
  this app is what pushed `packages/shared_types` from "the customer web app's types" to a real
  shared package — `Order` gained the `table`/`payments` fields only staff routes return,
  `Floor`/`RestaurantTable`/`Invoice` were added (previously only hand-mirrored in Dart), and the
  RBAC `PERMISSIONS` catalog and `generateId()` (the `crypto.randomUUID()`-secure-context
  workaround — see `docs/troubleshooting.md`) both moved here from being customer-web-only so
  this app gets them by construction instead of by copy-paste. See docs/architecture.md §13.
- **Print bill** (`billing.view`-gated button on `BillingDetailScreen`, `POST /invoices/:id/print`):
  `BillingService.generateInvoice` already auto-queues a receipt print job the instant a bill is
  first created, but only once (it's idempotent and doesn't re-print on a repeat call) — this is
  the explicit reprint, for a printer that wasn't ready at that exact moment or a second copy for
  the customer. See `docs/printing.md`.
- **Printers screen** (`printers.manage`-gated, `src/features/printers/PrintersScreen.tsx`, at
  `/printers`): lists an outlet's registered printers and lets an Owner/Manager add one — the
  piece `services/print-agent/README.md` always assumed existed ("create a printer via Settings →
  Printers") but that no app actually had until now. `apps/restaurant_app` now has the same
  screen, reached via its own new Settings destination (`lib/features/settings/settings_screen.dart`,
  `lib/features/printers/printers_screen.dart`) — no longer a placeholder.
- **Printer job history/health** (`PrinterJobsScreen.tsx`, `/printers/:printerId/jobs`, reached by
  tapping a printer row): per-printer queue depth, recent-failure count, and job-by-job status —
  `GET /printers/:id/jobs` existed with no UI consumer until now. `apps/restaurant_app` has the
  same screen (`printer_jobs_screen.dart`). Read-only (no retry/cancel), last 50 jobs only (the
  endpoint has no pagination). See docs/printing.md's "Operator visibility" section for the full
  detail, including how a stuck `QUEUED` job (not just `FAILED` ones) is flagged as a likely
  agent-down signal.
- **Discount and refund cards** (`orders.discount`/`payments.refund`-gated, both on
  `BillingDetailScreen.tsx`): these backend endpoints had no UI anywhere until now. `DiscountCard`
  shows the order's (at most one, in v1) applied discount read-only, or an apply form when there
  isn't one yet and the order isn't financially settled — permanent once applied, no
  remove/replace endpoint exists. `RefundCard` renders once per payment that's
  `SUCCEEDED`/`PARTIALLY_REFUNDED` or already has refund history, computes the refundable balance
  client-side, and calls `initiateRefund` then `approveRefund` back-to-back as one action (v1
  requires the same permission for both). It warns before submitting that even a small partial
  refund flips a PAID/COMPLETED order's whole status to REFUNDED. `apps/restaurant_app` has the
  same two cards — see docs/flutter-app.md — and full backend detail is in docs/payments.md's
  Refunds section.

## Centralized color theme

Both web apps now source their color palette from one place: `packages/shared_types/src/theme.ts`
exports a `theme` token object and an `applyTheme()` function that writes it onto
`document.documentElement` as CSS custom properties (`--accent`, `--text`, `--veg`, ... — the same
names both apps' stylesheets already used). Each app's `main.tsx` calls `applyTheme()` once before
the first render; each app's `index.css` keeps a literal fallback copy of the same values on its
own `:root` (belt-and-braces if a script somehow fails to run before paint — see `theme.ts`'s doc
comment). Before this, `apps/customer_web/src/index.css` was the *only* place the palette lived —
building this second app either meant copy-pasting that block (silent drift risk the moment one
gets tweaked and the other doesn't) or centralizing once, which is what happened.

The Flutter app's `_brandSeed` (`apps/restaurant_app/lib/app.dart`) used to be kept in sync by hand
with this same accent — Dart can't import a TypeScript module, same tradeoff already made for
`lib/core/rbac/permissions.dart` — but now deliberately diverges: it's `Color(0xFFfdf2f8)` (a
near-white pink), not `#E85D2C`. See `_brandSeed`'s doc comment in `app.dart` for why they're
allowed to drift. The Flutter app derives its `ColorScheme` from that seed via
`ColorScheme.fromSeed(..., dynamicSchemeVariant: DynamicSchemeVariant.vibrant)` — a deliberately
bolder/more saturated Material 3 tonal palette than the default `tonalSpot` variant, chosen because
a fast-moving restaurant floor tool benefits from higher-contrast, easier-to-scan colors more than
the calmer default suits (see `_buildTheme`'s doc comment in `app.dart`); the two web apps don't
have an equivalent "variant" concept — `theme.ts`'s tokens are hand-picked literal values, not
algorithmically derived — so this is a place the two color systems intentionally diverge in
*process* while still sharing the same source accent.

## What's explicitly not built

Kitchen display (KDS) and staff/menu management screens are Flutter-only in v1 — this app is
scoped to the counter-facing POS/Waiter/Billing workflow, not full back-office management.
Printers landed here first (see "What's built" above) since pos_web already runs on whatever
machine ends up running `services/print-agent` in the common single-machine deployment, but
`apps/restaurant_app` now has the same screen too — see docs/flutter-app.md.
No offline queue — same LAN-first, no
guaranteed-offline design as every other v1 client (docs/offline-mode.md); a POS terminal that
loses the LAN mid-order shows the same "couldn't reach the server" error the guest app does.

## Running it

```bash
cd apps/pos_web
cp .env.example .env.local   # point VITE_API_BASE_URL at your running services/api
npm install                  # from the repo root, so it resolves as an npm workspace
npm run dev                  # or: npm run dev:pos from the repo root
```

See docs/local-development.md step 6 for the full walkthrough including LAN access from a second
device.

## Verification status

Built and verified the same concrete way as `apps/customer_web` (docs/customer-web.md) — Node and
the npm registry are both reachable in this sandbox, so this isn't subject to the
Prisma-engine-class restriction documented elsewhere. `npm run build` (`tsc -b && vite build`)
passes clean for both this app and `apps/customer_web` after the shared-types changes, and
`npm run lint` (`oxlint`) reports only the same categories of pre-existing, accepted warnings
`apps/customer_web` already carries (a fetch-in-effect pattern for each screen's initial data
load, and React-Fast-Refresh-boundary notices from co-locating a context provider with its hook)
— nothing new in kind, just more instances of the same accepted pattern across more screens. What
has **not** been verified is a real end-to-end run against a live `services/api` — same caveat as
`apps/customer_web`: that needs `prisma generate`, which this sandbox can't do (see
docs/troubleshooting.md). The API contracts above were read directly from the backend source
(controllers, DTOs) and cross-checked against the Flutter app's already-verified-live equivalents
(`apps/restaurant_app/lib/features/pos/data/*.dart`), not exercised over the network from here.
