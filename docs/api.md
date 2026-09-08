# API

## Conventions

- **Base path**: `/api/v1/...` — versioned from day one (spec §32). Every route lives under a resource matching `docs/architecture.md` §13's module list: `/api/v1/auth`, `/api/v1/organizations`, `/api/v1/outlets`, `/api/v1/menu`, `/api/v1/tables`, `/api/v1/dining-sessions`, `/api/v1/orders`, `/api/v1/kitchen`, `/api/v1/billing`, `/api/v1/payments`, `/api/v1/reports`, `/api/v1/staff`, `/api/v1/qr`, `/api/v1/printers`, `/api/v1/system`.
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

Generated from the NestJS controllers/DTOs via `@nestjs/swagger`, served at `/api/v1/docs` in non-production environments once the controllers land (tracked in `docs/architecture.md` §15). The generated `openapi.json` is what `packages/shared_types` and, eventually, the Flutter app's generated API client are meant to be produced from — keeping request/response shapes in one authored place (the DTOs) rather than hand-duplicated per client.

## WebSocket

Namespace `/realtime`, Socket.IO. Clients authenticate on connect with the same access/session token used for REST, and join a room `org:<organizationId>:outlet:<outletId>` (kitchen clients additionally join `station:<stationId>`). Event catalog and the "events are hints, refetch from REST" contract are in `docs/architecture.md` §8.

## Status

This document describes the conventions every endpoint follows as it's built; it is not yet a full endpoint reference (that's what the generated OpenAPI spec is for, once available). See `docs/architecture.md` §15 for which modules/endpoints currently exist.
