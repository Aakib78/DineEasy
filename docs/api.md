# API

## Conventions

- **Base path**: `/api/v1/...` — versioned from day one (spec §32). Every route lives under a resource matching `docs/architecture.md` §13's module list: `/api/v1/auth`, `/api/v1/organizations`, `/api/v1/outlets`, `/api/v1/menu`, `/api/v1/tables`, `/api/v1/dining-sessions`, `/api/v1/orders`, `/api/v1/kitchen`, `/api/v1/billing`, `/api/v1/payments`, `/api/v1/reports`, `/api/v1/staff`, `/api/v1/qr`, `/api/v1/printers`, `/api/v1/notifications`, `/api/v1/system`.
- **Auth**: `Authorization: Bearer <access-token>` for staff routes; a dining-session token (also a bearer JWT, narrower scope) for customer/QR routes. See `docs/authentication.md`.
- **Validation**: every request body is a `class-validator`-decorated DTO behind a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — unknown fields are rejected, not silently dropped, so a client bug surfaces immediately instead of silently losing data.
- **Errors**: a consistent JSON shape —
  ```json
  { "statusCode": 409, "error": "InvalidOrderTransition", "message": "Cannot move order from PAID to PREPARING", "requestId": "..." }
  ```
  mapped from typed domain exceptions (`InvalidOrderTransitionError` → 409, `NotFoundError` → 404, `ForbiddenError` → 403, `ValidationError` → 400) by a global exception filter — handlers throw domain errors, never construct HTTP responses by hand.
- **Pagination**: cursor-based (`?cursor=...&limit=...`) on list endpoints expected to grow large (orders, audit logs); offset-based (`?page=&pageSize=`) on small, bounded lists (staff, tables). Every paginated response includes `{ data, nextCursor | page/pageSize/total }`.
- **Filtering/sorting**: `?filter[status]=PLACED&sort=-createdAt` convention on list endpoints — a documented, consistent query shape rather than ad hoc per-endpoint query params.
- **Idempotency**: any endpoint that creates a financially/operationally significant resource (`POST /orders`, `POST /payments`, `POST /kitchen/kot`) accepts (and for order/payment creation, requires) an `Idempotency-Key` header; see `docs/offline-mode.md`.
- **Correlation**: every response carries `x-request-id` (echoing the request's, or generated) for support/debugging (`docs/architecture.md` §12).

## OpenAPI

Wired up in `main.ts`: `@nestjs/swagger`'s `SwaggerModule`, plus its CLI plugin enabled in `nest-cli.json` (`introspectComments`/`classValidatorShim`) so DTO fields get their schema inferred from their TypeScript types and `class-validator` decorators automatically, without hand-adding `@ApiProperty()` to every field across every module. Served at `/api/docs` (UI) and `/api/docs-json` (raw spec) — a **literal** path, deliberately outside the `/api/v1` prefix `setGlobalPrefix` applies to everything else, since `SwaggerModule.setup()` isn't affected by that prefix unless told to be. Gated on `API_DOCS_ENABLED` (default: on outside `production`, off in it — see `.env.example`), not on the controllers "landing" — every controller in the app is already covered since the plugin works automatically, no per-module opt-in step. `@ApiBearerAuth(...)` per-controller (the lock-icon "try it out" affordance in the Swagger UI) is not yet applied anywhere — a follow-up, not a blocker; the two bearer schemes (`staff-jwt`, `guest-dining-session-token`) are registered either way.

**Not verified in this environment**: actually producing the spec means bootstrapping the live NestJS app (`SwaggerModule.createDocument(app, ...)` needs a real `app` instance), which needs a working `@prisma/client` — the same `prisma generate`-can't-fetch-its-engine-binaries restriction as everything else DB-touching in this sandbox (see `docs/troubleshooting.md`). `npx tsc --noEmit` and `npx eslint` both stay clean on every file this feature touched (`main.ts`, `configuration.ts`, `env.validation.ts`), and the error count from the pre-existing Prisma-typing gap is unchanged (still 53, all in files this didn't touch) — but nobody has actually loaded `/api/docs` and looked at it. That, and whether `packages/shared_types` should switch from hand-written types to spec-generated ones once it can, are both open items for a machine that can run `prisma generate` normally.

## WebSocket

Namespace `/realtime`, Socket.IO. Clients authenticate on connect with the same access/session token used for REST, and join a room `org:<organizationId>:outlet:<outletId>` (kitchen clients additionally join `station:<stationId>`). Event catalog and the "events are hints, refetch from REST" contract are in `docs/architecture.md` §8.

## Status

This document describes the conventions every endpoint follows as it's built; it is not yet a full endpoint reference (that's what the generated OpenAPI spec is for, once available). See `docs/architecture.md` §15 for which modules/endpoints currently exist.
