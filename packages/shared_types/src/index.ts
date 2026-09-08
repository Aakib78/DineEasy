/**
 * @dineeasy/shared-types — hand-written TypeScript types mirroring `services/api`'s JSON
 * response shapes, for any TypeScript frontend in this monorepo to import instead of
 * re-declaring the same shapes locally.
 *
 * Why hand-written rather than generated from an OpenAPI spec: `services/api` has
 * `@nestjs/swagger` wired up (`main.ts`, `nest-cli.json`'s compiler plugin) to produce that spec,
 * but *generating* it means bootstrapping the live NestJS app, which needs a working
 * `@prisma/client` — and `prisma generate` cannot fetch its engine binaries in this sandbox
 * (blocked at the network proxy allowlist, same restriction documented throughout
 * docs/troubleshooting.md). So today these are hand-extracted from the backend's controllers/
 * services, exactly as they were before this package existed (previously duplicated directly
 * inside `apps/customer_web/src/lib/api/types.ts`, which now just re-exports this package — see
 * that file). Once a normal dev machine can run `prisma generate` and boot the API, swapping
 * this for `openapi-typescript` output generated from the live `/api-docs-json` spec is the
 * natural next step (see docs/architecture.md §13) — nothing here is designed to fight that
 * migration, since these interfaces are already shaped to match the wire JSON field-for-field.
 *
 * Not included here: anything client-only (e.g. `apps/customer_web`'s cart line items before
 * "Place order" — see `docs/qr-ordering.md`), and the RBAC permission catalog (mirrored
 * separately per-consumer today: `lib/core/rbac/permissions.dart` in the Flutter app, which
 * can't consume a TypeScript package regardless — see docs/flutter-app.md — and no TypeScript
 * consumer needs it yet, so it isn't duplicated here on spec).
 */

export * from './qr.js';
export * from './menu.js';
export * from './orders.js';
