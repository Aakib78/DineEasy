# Troubleshooting

## Development / build environment

### `prisma migrate dev`, `prisma generate`, or `prisma format` fails with a 403 from `binaries.prisma.sh`

Prisma's CLI downloads a Rust "schema-engine" / "query-engine" binary from `binaries.prisma.sh` on first use. Some sandboxed or locked-down networks (including the cloud environment this project was originally scaffolded in) block that host by policy. Symptoms:

```
Error: Failed to fetch the engine file at https://binaries.prisma.sh/... - 403 Forbidden
```

Fixes, in order of preference:
1. Run the Prisma command from a machine/network that can reach `binaries.prisma.sh` (a normal laptop with regular internet access works fine — this is specifically a sandboxed-CI/restricted-egress problem, not a bug in the project).
2. If you're behind a corporate proxy, allowlist `binaries.prisma.sh` (schema/migrate engine) — Prisma's engine downloads are a hard dependency for `migrate dev`, `generate`, `format`, `studio`, and `db pull`.
3. As a last resort for applying the already-committed initial schema: run `services/api/prisma/migrations/20260908000000_init/migration.sql` directly with `psql` against your target database — it's been validated to apply cleanly on Postgres 16 and needs no Prisma engine at all. This only helps for the *existing* migration; you still need a working Prisma CLI to author new ones.

This does not affect the running application — the generated `@prisma/client` code, once built on a machine that could reach the engine host, works everywhere the app itself runs (including fully offline on a restaurant LAN, per `docs/offline-mode.md`).

### `docker compose up` fails to reach the internet inside a build (`apt-get`/`npm install` errors during `docker build`)

If you're on a restricted network, Docker's build containers may not inherit your proxy settings. Either configure `~/.docker/config.json` `proxies`, or pass `--build-arg HTTP_PROXY=...`/`HTTPS_PROXY=...` matching your environment.

### `docker compose up` / `docker pull` fails with `403 Forbidden` resolving `registry-1.docker.io`

A third member of the same restricted-egress family as the two entries above (this project was built in a sandbox that allowlists the npm/PyPI/crates/Go module registries but not Docker Hub) — the fix is the same: run it from a network that can actually reach Docker Hub. This is why the compose files in this repo were validated here with `docker compose config` (pure YAML/interpolation validation, no image pull) rather than a real `docker compose up`, using a natively `apt`-installed Postgres 16 + Redis instead (both packages *were* reachable via the Ubuntu archive mirrors in that sandbox) to re-confirm the migration and app config independently — see `docs/architecture.md` §15 for exactly what that did and didn't prove. If your network can reach Docker Hub, a plain `docker compose up` should just work; if you hit this specific error, the compose files are not the problem.

### Fixed in this repo: `docker compose up`/`config` used to fail outright

Three real bugs were caught the first time these compose files were actually exercised (previously only read, never run — see the git history around the LAN/offline-validation slice):

1. `infrastructure/docker/docker-compose.yml` had a stray literal `\` as its very first byte (predates a `#` comment on the same intended line), which is invalid YAML — `docker compose` refused to parse the file at all, for every command, unconditionally. Fixed by deleting the stray character.
2. Running `docker compose` from the repo root with `-f infrastructure/docker/...` does **not** auto-load the root `.env` the way you'd expect — Compose's default project directory (and therefore its default `.env` lookup) follows the directory of the *first* `-f` file, not your current directory, once you pass explicit `-f` flags. `npm run docker:up`/`docker:down`/`docker:prod` now pass `--env-file .env` explicitly rather than relying on the auto-load. If you're running `docker compose` by hand from the repo root instead of via the npm scripts, do the same (`docker compose --env-file .env -f ...`) or you'll hit `POSTGRES_PASSWORD is required` even with a perfectly good `.env` sitting right there.
3. `docker-compose.test.yml` overriding `POSTGRES_PASSWORD` with a literal value didn't actually satisfy the base file's `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}` guard — Compose interpolates each file's own variables before merging overlays, so a later file's literal override can't retroactively satisfy an earlier file's required-variable check. `npm run docker:test` now exports `POSTGRES_PASSWORD` directly in the command itself so the base file's interpolation always has something to see.

All three combinations (`docker-compose.yml` alone, `+dev`, `+test`) were re-validated with `docker compose config --quiet` after the fixes (exit code 0, and for the `web` service specifically, confirmed `VITE_API_BASE_URL` actually resolves as a build arg — see the next section).

A fourth issue, found while adding `apps/customer_web/Dockerfile` (it didn't exist until the customer PWA was built — see `docs/customer-web.md` — even though the base compose file already referenced it): the `web` service was setting a container-runtime `environment: VITE_API_URL: ...` entry, which is wrong two ways at once — the app actually reads `VITE_API_BASE_URL` (not `VITE_API_URL`), and Vite bakes `VITE_`-prefixed env vars into the bundle at *build* time, so a runtime `environment:` entry on a pre-built static nginx image does nothing regardless of its name. Fixed by passing it as a `build.args` entry instead (`docker-compose.yml`) and, for the dev target where Vite's own dev server does read runtime env vars, as `environment:` on that override only (`docker-compose.dev.yml`).

### Fixed in this repo: `prisma migrate dev`/`seed` couldn't find `DATABASE_URL`, and a real seed bug, both caught on the first real run against a live network

Two more real bugs, both invisible in this sandbox for the same reason as the ones above — this was the first time any of `prisma migrate dev`, `prisma generate` running against a real database, or the seed script had ever actually executed past the `binaries.prisma.sh` restriction (`docs/architecture.md` §15). Running them for real (on a normal machine, per the fix above) surfaced both immediately:

1. `services/api`'s `prisma migrate dev`/`prisma:studio`/`seed` scripts failed with `Environment variable not found: DATABASE_URL`, even with a perfectly good root `.env` in place. Cause: every `npm run --workspace services/api <script>` (and `npm run dev:api`) runs with `services/api` as the process's working directory, not the repo root — and both Prisma CLI's own `.env` auto-loading and `@nestjs/config`'s default `envFilePath` resolve relative to that cwd, so neither ever looked at the root `.env` in the first place; this failed silently up front (no error about *finding* it, just about the variable inside it never existing). Fixed two ways, matching where each reader actually runs: `AppModule`'s `ConfigModule.forRoot` now passes `envFilePath: ['.env', '../../.env']` (covers the running app, `npm run dev:api`/`start`), and the `prisma:*`/`seed` scripts in `services/api/package.json` now go through `dotenv-cli` (`dotenv -e ../../.env -- prisma migrate dev`, etc. — covers the Prisma CLI and `ts-node prisma/seed.ts`, neither of which goes through Nest's `ConfigModule` at all). The root `.env` stays the single source of truth either way; nothing needs copying into `services/api/`.
2. `prisma/seed.ts` failed to compile: `prisma.userRole.upsert({ where: { userId_roleId_outletId: { ..., outletId } }, ... })` where `outletId` is `string | null` (org-wide roles, e.g. Owner, are seeded with `outletId: null`) — TS2322, `outletId` can't be `null` in that position. This isn't a seed-script-only quirk: `UserRole`'s `@@unique([userId, roleId, outletId])` includes a nullable column (`outletId String?`), and Prisma's generated compound-key `WhereUniqueInput` never accepts `null` for a nullable member of a unique index, because SQL's `NULL <> NULL` means an equality lookup there can't reliably mean "the row where this is NULL" the way `upsert`/`findUnique` require. `UsersService.removeRoleAssignment` already works around the identical shape with a plain (non-compound-key) `where` filter instead; `seed.ts` now does the same — `findFirst` + a manual `create` instead of `upsert` on the compound key. Both fixes were verified by an actual `tsc`/`ts-node` run against a *real* generated `@prisma/client` (on a machine that could reach `binaries.prisma.sh`) — the first time anything in this repo touching the generated client had been checked against the real thing rather than read for plausibility.

**Confirmed working end-to-end** after both fixes above plus the Docker port-conflict note below: `prisma:generate`, `prisma:migrate:dev`, and `seed` all completed successfully against a real dockerized Postgres on a developer's Mac — the first successful live run of this project's database layer since the schema was written. The demo accounts from `docs/local-development.md` §8 are now real, queryable rows.

### Fixed in this repo: `npm run docker:up` failed building the `web` image with `404 Not Found - @dineeasy/shared-types`

Another bug caught the first time these images were actually built (Docker Hub is blocked in the sandbox this repo was scaffolded in, so only `docker compose config` — pure YAML validation, no build — had ever been run against these compose files before now; see the `registry-1.docker.io` entry above). Symptom:

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@dineeasy%2fshared-types - Not found
npm error 404  '@dineeasy/shared-types@*' is not in this registry.
```

Cause: `apps/customer_web` depends on `packages/shared_types` (`@dineeasy/shared-types`, version `"*"`) as a local npm workspace package — it's never been published anywhere, and never should be. `apps/customer_web/Dockerfile`'s build context was `apps/customer_web` itself (`context: ../../apps/customer_web` in `docker-compose.yml`), so `packages/shared_types` was completely outside what Docker could see; `npm install` fell through to looking for it on the real npm registry and 404'd. `services/api`'s image never hit this because `services/api` doesn't currently depend on `packages/shared_types`.

Fixed by moving the `web` image's build context to the monorepo root (`context: ../..`, `dockerfile: apps/customer_web/Dockerfile`) so the whole workspace — root `package.json`/`package-lock.json` plus every workspace member's `package.json` — is visible to `npm install`, which is what lets npm link `@dineeasy/shared-types` from `packages/shared_types` instead of hitting the registry. Added a root `.dockerignore` (there wasn't one — only `services/api/.dockerignore`, scoped to that image's own context) so the larger root build context doesn't ship `node_modules`/`.git`/build output to the Docker daemon. `docker-compose.dev.yml`'s `web` bind mount changed from `../../apps/customer_web:/app` to `../..:/repo` (matching the Dockerfile's new `/repo` root, with `/repo/node_modules` and `/repo/apps/customer_web/node_modules` as anonymous volumes protecting the image's Linux-built `node_modules` from the host's) — this also means editing `packages/shared_types` now hot-reloads the dev container, which it couldn't before.

Both compose files re-validated with `docker compose config --quiet` after the fix (exit 0) — this sandbox still can't do a real `docker build` (same Docker Hub block), so the actual image build was verified on a real machine, not here. **Confirmed fixed**: `npm run docker:up` now builds and runs both the `api` and `web` images successfully on a real machine.

If you only need Postgres + Redis (the normal day-to-day setup — see the top of `docs/local-development.md`), skip the full `docker:up` build entirely and start just those two services:

```
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis
```

### Fixed in this repo: `npm run dev:api` fails to compile with 8 `tsc` errors, all in files touching Prisma's generated `Json`/enum types

The last piece invisible in this sandbox for the usual reason — this repo's own `tsc` here has only ever run against a placeholder stub client (`node_modules/.prisma/client` ships a generic `PrismaClient: any` fallback until `prisma generate` actually completes, and `generate` has always 403'd here), so nothing that depends on the real generated types — a specific enum member, a `Json` field's exact input type — had ever actually been checked before this. All 8 errors were one of two shapes:

1. A hand-written pure-logic value (`invoice-tax.util.ts`'s `taxType: string`, deliberately untyped against Prisma so that file has zero client dependency — see its header comment) or a DTO field validated only as `Record<string, unknown>`/`string[]` (class-validator's `@IsObject()` doesn't know about Prisma's `Json` input type) being passed straight into a Prisma `create`/`createMany`/`where` call. Prisma's generated `Json` fields want its own recursive `InputJsonValue`, and enum fields want the actual generated enum, neither of which a plain `string`/`Record<string, unknown>` structurally satisfies. Fixed by casting at the Prisma call site — `taxType as TaxType` in `billing.service.ts`, `rawPayload as Prisma.InputJsonValue | undefined` in `payments.service.ts`, `payload as Prisma.InputJsonValue` (both call sites) in `printers.service.ts` — the same boundary-cast pattern already established for `OrderStatus` elsewhere in this codebase.
2. `reports.service.ts`'s local `SETTLED_STATUSES` array literal widened to plain `string[]`, which doesn't satisfy Prisma's `status: { in: OrderStatus[] }` filter — fixed by annotating it `OrderStatus[]` (imported from `@prisma/client`, not the hand-written mirror type in `order-state-machine.ts` — deliberately a *different* set of statuses than `ORDER_FINANCIALLY_SETTLED_STATUSES`, see the new comment there). Plus two `groupBy` results (`g._sum.quantity`/`g._sum.total`) where Prisma's generated aggregate type makes `_sum` optional — fixed with `?.`.

Same kind of real-client-only bug as the `seed.ts` fix above, just caught one step later (at `nest start --watch`'s `tsc` pass instead of `ts-node`'s) — `prisma:migrate:dev` and `seed` had already succeeded for real by the time this surfaced.

**Confirmed fixed**: `npm run dev:api` compiles with 0 errors and starts successfully (`Nest application successfully started`, listening on `http://0.0.0.0:3000/api/v1`) against the real seeded database — the first successful live start of the API in this project's history.

### Fixed in this repo: login (and every other `runUnscoped` call) failed with `Tenant-safety: User.findMany() has no organizationId filter and no request context is bound`

The most subtle bug caught in this whole first-real-run pass — not a stub-client artifact, a genuine AsyncLocalStorage/Prisma interaction bug that could only ever show up against a real client handling a real HTTP request (the sandbox's stub client can't dispatch queries at all, so `$use` middleware — where this fires — never runs there). Hit on the very first login attempt, the first HTTP request in this project's history to reach a tenant-guarded Prisma call.

Cause: `TenantContextStore.runUnscoped(fn)` bound `bypassTenantGuard: true` via `AsyncLocalStorage.run({ ...current, bypassTenantGuard: true }, fn)`, then just called `fn()` and returned the result — it never awaited it *inside* the `als.run()` callback. Prisma's query methods (`findMany`, `findFirst`, `$queryRaw`, etc.) return a lazy `PrismaPromise`: calling `prisma.user.findMany(...)` does not dispatch the query, and does not run `$use` middleware, until something actually calls `.then()`/awaits it — which, for `await TenantContextStore.runUnscoped(() => this.prisma.user.findMany(...))`, happens *outside* `runUnscoped`, after `als.run()`'s synchronous callback has already returned and its bound scope has ended. So by the time `PrismaService`'s tenant-guard middleware actually ran and read `TenantContextStore.current`, there was no bound context at all — `bypassTenantGuard` was never seen, and the guard correctly (if confusingly, from the call site's point of view) failed closed. This affected every `runUnscoped` call site written as a plain arrow returning a bare Prisma call (`AuthService.login`/`refresh`/`logout`, `QrService.resolveTokenAndJoinSession`, `RolesService.seedSystemRolesForOrganization`, `SystemController`'s healthcheck query) — the two call sites already written as `async () => { await ...; }` (`RolesService.ensurePermissionCatalog`, `PaymentsService.handleProviderWebhook`) happened to be safe already, because their first `await` occurs while still synchronously inside the callback.

Fixed centrally in `TenantContextStore.runUnscoped` itself (`services/api/src/common/context/tenant-context.ts`) — it now wraps `fn` in `async () => await fn()` before handing it to `als.run()`, guaranteeing the actual dispatch happens while still inside the bound scope, regardless of which style a call site uses. No call sites needed to change. Added `tenant-context.spec.ts` — a real, runnable test using Node's actual `AsyncLocalStorage` plus a fake lazy thenable that reproduces Prisma's exact laziness (dispatch deferred via a real `setImmediate` hop), no Prisma client required. Confirmed the test fails against the old implementation (3 of 10 cases) and passes against the fix, so this isn't a test that happens to pass regardless.

### Fixed in this repo: logging in as the seeded Owner shows "You're not assigned to an outlet yet" and every outlet-scoped screen is unreachable

Caught on this project's first real login, with the first seeded demo account anyone would naturally try (Owner is listed first in `docs/local-development.md`'s demo-login table). `AuthService.resolveActiveOutlet` only auto-picked an active outlet from the user's *outlet-scoped* `UserRole` rows — Owner is deliberately org-wide (`outletId: null`, by design: Owner oversees the whole organization, not one outlet — see `prisma/seed.ts`), so it has zero outlet-scoped rows and fell through to "no active outlet." The Flutter app's `home_shell.dart` treats that as "go show the dead-end screen," which every POS/Tables/Kitchen/Billing screen sits behind, since they're all outlet-scoped. Functionally, an Owner account could log in but couldn't use the app at all.

This was a known, deliberate v1 heuristic (the code's own comment already said an org-wide role "picks one client-side when multi-outlet support ships" — spec §20) — but no client-side picker exists yet, so for the single-outlet-restaurant case (this app's actual primary target market per `docs/architecture.md` §1's Delhi/Faridabad launch framing, and exactly what the demo seed data is), that left a total dead end with no workaround. Fixed by having `resolveActiveOutlet` fall back to the organization's outlet when it has exactly one — covers the common single-outlet case automatically; an organization with more than one outlet (or a user with more than one outlet-scoped role) still has no single right answer and is correctly left unset pending that future picker.

Pending confirmation from a real login as `owner@dineeasy-demo.test` — this sandbox's stub Prisma client can't exercise the fix either (same limitation as everywhere else in this section).

### Fixed in this repo: placing an order against seeded demo data fails with `"menuItemId must be a UUID"`

Caught the first time anyone actually tried the customer QR-ordering flow against the seeded demo menu. `CreateOrderItemDto.menuItemId`/`menuItemVariantId` and `OrderItemModifierInput.modifierId` were validated with `@IsUUID()`, and `CreateMenuItemDto`/`UpdateMenuItemDto`'s `categoryId`/`taxGroupId`/`modifierGroupIds` the same way — but `prisma/seed.ts` deliberately gives `MenuItem`, `MenuItemVariant`, `Modifier`, `MenuCategory`, and `TaxGroup` rows human-readable ids (`demo-item-paneer-tikka`, `demo-mg-spice-mild`, `demo-cat-starters`, `demo-tax-gst5`, ...) instead of the schema's `@default(uuid())`, specifically so re-running the seed script is idempotent by a stable, readable key rather than a fresh random id every time. `@IsUUID()` rejected every one of them outright.

This wasn't actually a mismatch between the seed data and the schema — `id String @id @default(uuid())` in `schema.prisma` means the column is a plain string, and `@default(uuid())` is only the value used when nothing else is supplied at creation; Prisma has always fully supported an explicit non-UUID id there, and the actual existence/ownership check happens via the Prisma lookup in the service layer regardless of the id's textual format. The `@IsUUID()` validators were checking an implementation detail of one id-generation strategy, not a real invariant — so they were the bug, not the seed data. Fixed by relaxing all of them to `@IsString() @IsNotEmpty()` (or the array equivalent). `RestaurantTable`/`Floor`/`Outlet`/`Organization` ids are untouched — seed.ts never overrides those, so they're always real UUIDs, and their `@IsUUID()` checks stay as-is.

Pending confirmation from a real order placed against the seeded demo menu — this sandbox has no live database to place an order against either way.

### Fixed in this repo: an order stays "open" on its table forever after the kitchen marks everything Done

Caught testing the very first full order lifecycle end to end — place an order → kitchen works it → table never clears. This is expected in one sense and a real gap in another. Expected: the Kitchen board only ever drives an order as far as `READY` (`KITCHEN_DRIVEN_PATH` in `services/api/src/modules/kitchen/kitchen.service.ts` stops there on purpose — the kitchen has no way to know when a waiter has actually carried the food to the table, so `READY` → `SERVED` is deliberately a separate action). The gap: the backend has always had `POST /orders/:id/serve` for exactly this, but nothing in the Flutter staff app ever called it — there was no "mark served" control anywhere in the UI, so an order could reach `READY` and then have no way forward at all. Billing wouldn't offer it either (`billing_screen.dart` only lists `SERVED` orders).

Fixed by adding a "Mark served" button to the existing-order banner in `OrderBuilderScreen` (shown when you tap back into a table that already has an order) — visible only when the order is `READY`, the signed-in user has `orders.update`, and there isn't already a serve call in flight. See `docs/flutter-app.md`'s changelog entry for the full detail. Not verified in this environment — no Flutter/Dart SDK here, same limitation as everywhere else Flutter-side (see "Why there's no `android/`..." above) — pending confirmation from a real run.

### Not a bug: manually setting a table's status to "Available" doesn't clear "Order open"

`table.status` (`AVAILABLE`/`OCCUPIED`/`RESERVED`/`DISABLED`) and the "Order open" tint on the POS table grid are two independent signals — changing one never touches the other, on purpose.

- `table.status` is just a flag staff set directly on the table row via table management. It carries no information about orders.
- "Order open" is computed client-side in `pos_home_screen.dart` from `activeOrdersProvider`, which calls `GET /orders` (`OrdersService.listActiveForOutlet` in `services/api/src/modules/orders/orders.service.ts`). That query returns every order on the outlet whose `status` is **not** `COMPLETED`, `CANCELLED`, or `REFUNDED` — so anything from `DRAFT` all the way through `BILLED`/`PAID` still counts as "active." The screen collects every `tableId` present in that list and tints the matching table orange with "Order open," regardless of `table.status`.

So a table stays "Order open" until its order actually reaches `COMPLETED` (or is cancelled) — walk it forward instead: mark it served (`READY` → `SERVED`, see the entry above), generate the invoice from Billing (`SERVED` → `BILLED`), then record payment covering the full total, which auto-advances `BILLED` → `PAID` → `COMPLETED`. Only then does the order drop out of the active-orders list and the tile clears on its own. Toggling `table.status` back to "Available" is a no-op for this — it doesn't cancel or complete the order underneath it.

### `docker compose up postgres redis` fails with `address already in use` on port 5432, even though nothing shows up in `lsof`

Seen in practice on macOS with Docker Desktop after an earlier `docker compose up` attempt got interrupted partway (for example, the `web` image build failing per the entry above, or Docker Desktop being restarted mid-`up`) and left a container behind in `Created` state (`docker ps -a` shows it, but never `Up`). Removing that container (`docker rm <name>`) and retrying can still fail with the same port error — Docker Desktop's own internal port-forwarding layer (inside its VM, not your host OS) can hold a stale reservation that a plain container removal doesn't clear, which is also why the host's `lsof -iTCP:5432` shows nothing: the conflict isn't visible at the macOS network level at all.

Fixes, in order of effort:
1. Quit and reopen Docker Desktop entirely (not just restart a container) — this resets its internal VM networking state and is usually sufficient.
2. If you'd rather not restart Docker Desktop, change `POSTGRES_PORT` (and the port in `DATABASE_URL`) in `.env` to an unused port (e.g. `5433`) and bring the stack up again — sidesteps the conflict instead of resolving it, but unblocks local development immediately.

## Runtime

### Flutter app shows "Can't connect to DineEasy Server"

1. Confirm the server is actually running: `docker compose -f infrastructure/docker/docker-compose.yml ps` should show `api` as healthy.
2. Confirm the device is on the same LAN/SSID as the server (guest Wi-Fi vs staff Wi-Fi matters — see `docs/architecture.md` §1).
3. There's no in-app "find/set the server" screen yet (tracked as a follow-up — see `docs/offline-mode.md` for how LAN discovery is meant to work once implemented); the address is set at launch instead, via `flutter run --dart-define=API_BASE_URL=http://<server-lan-ip>:3000/api/v1` (see `docs/local-development.md` §6). A physical device can't reach your dev machine's `localhost` — it needs the machine's actual LAN IP.
4. Check the in-app System Status screen — it reports API/DB/Redis reachability independently, which narrows down whether the problem is network or the server process itself.

### Customer can't load the QR menu on the restaurant's guest Wi-Fi

This is almost always a guest-network isolation setting on the restaurant's router (client isolation / AP isolation), which by design prevents guest devices from reaching *anything* else on the LAN, including the DineEasy server. See `docs/deployment.md` for the guest-network requirement; the fix is a router configuration change, not a DineEasy change.

### Duplicate orders after a retry / spotty connection

Shouldn't happen — order creation is idempotent on a client-generated key (`docs/offline-mode.md`, `docs/api.md`). If you do see it, please capture the `x-request-id` from both requests (visible in the API logs) and file it as a bug; this is treated as a correctness-critical failure per spec §51.

## Where to look for logs

- API: structured JSON logs (pino) to stdout, each line carrying `requestId`. `docker compose logs -f api`.
- Postgres/Redis: `docker compose logs -f postgres redis`.
- Flutter: in-app System Status screen has a "diagnostic export" for support engineers (spec §60) — planned; tracked in `docs/architecture.md` §15 build status.
