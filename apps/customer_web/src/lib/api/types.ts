/**
 * Every shape here now lives in `@dineeasy/shared-types` (`packages/shared_types/src/`) — this
 * file is kept as a thin re-export so the seven files across this app that already
 * `import ... from '../../lib/api/types'` (or similar relative paths) don't all need their
 * import paths rewritten. Add new *local-only* wire types here directly if this app ever needs
 * one the backend contract doesn't share with any other TypeScript consumer; anything that
 * mirrors an actual `services/api` response shape belongs in the shared package instead, not
 * here — see `@dineeasy/shared-types`'s own module doc comment for why these are hand-written
 * rather than generated from the backend's OpenAPI spec (`services/api`'s `@nestjs/swagger`
 * wiring exists, but actually running it to produce that spec needs a working `@prisma/client`,
 * which `prisma generate` can't produce in this sandbox — see docs/troubleshooting.md).
 */
export * from '@dineeasy/shared-types';
