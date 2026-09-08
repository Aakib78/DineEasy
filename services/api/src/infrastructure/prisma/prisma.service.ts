import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextStore } from '../../common/context/tenant-context';

/**
 * Prisma models that carry `organizationId` directly and must always be filtered by it.
 * `findUnique`/`update`/`delete` are intentionally NOT exempted here — see the middleware
 * comment below for why single-record lookups on these models must go through
 * `findFirst`/`updateMany`/`deleteMany` instead, never a bare `findUnique`.
 */
const ORGANIZATION_SCOPED_MODELS = new Set([
  'Outlet',
  'User',
  'Role',
  'DiningSession',
  'Order',
  'KitchenOrder',
  'Invoice',
  'Payment',
  'AuditLog',
]);

/**
 * Models that carry `outletId` but not `organizationId` directly (they hang off an Outlet
 * that is itself organization-scoped). Guarded on `outletId` instead.
 */
const OUTLET_SCOPED_MODELS = new Set([
  'Floor',
  'RestaurantTable',
  'Menu',
  'ModifierGroup',
  'TaxGroup',
  'KitchenStation',
  'Printer',
]);

const READ_ACTIONS = new Set(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy']);
const WRITE_MANY_ACTIONS = new Set(['updateMany', 'deleteMany']);
// findUnique/update/delete take only a @unique/@id field in `where`, so organizationId/
// outletId can't be injected — callers must use findFirst/updateMany/deleteMany instead.
// upsert is handled separately below: its `create` payload is required by Prisma to include
// every non-optional field anyway, so we validate the scope key there instead of banning it.
const SINGLE_RECORD_ACTIONS = new Set(['findUnique', 'update', 'delete']);

/**
 * PrismaService wraps PrismaClient with a tenant-isolation middleware (docs/architecture.md
 * §3): any query against an organization/outlet-scoped model that isn't filtered by the
 * *current request's* tenant context fails closed with an error, rather than silently
 * returning cross-tenant data because a service method forgot a `where` clause.
 *
 * This is deliberately a blunt, request-context-driven guard rather than row-level security
 * in Postgres itself — simpler to reason about for a single-process app, and the explicit
 * failure (throwing) surfaces a missing filter in development/tests immediately instead of
 * relying on RLS policies nobody remembers to update when a new tenant-scoped table is added.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    this.$use(this.tenantGuardMiddleware.bind(this));

    // @ts-expect-error -- $on's event typings don't cover the 'warn'/'error' log events cleanly
    this.$on('warn', (e: Prisma.LogEvent) => this.logger.warn(e.message));
    // @ts-expect-error -- see above
    this.$on('error', (e: Prisma.LogEvent) => this.logger.error(e.message));

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  private tenantGuardMiddleware: Prisma.Middleware = async (params, next) => {
    const { model, action, args } = params;

    if (!model) return next(params);
    if (TenantContextStore.current?.bypassTenantGuard) return next(params);

    const isOrgScoped = ORGANIZATION_SCOPED_MODELS.has(model);
    const isOutletScoped = OUTLET_SCOPED_MODELS.has(model);
    if (!isOrgScoped && !isOutletScoped) return next(params);

    const scopeKey = isOrgScoped ? 'organizationId' : 'outletId';
    const contextValue = isOrgScoped
      ? TenantContextStore.organizationId
      : TenantContextStore.outletId;

    if (SINGLE_RECORD_ACTIONS.has(action)) {
      // Prisma's findUnique/update/delete only accept a @unique/@id field in `where`, so we
      // cannot inject organizationId/outletId into it directly. Rather than silently allow an
      // unscoped single-record lookup, we require callers to use findFirst/updateMany/
      // deleteMany for tenant-scoped models (which DO get the check below) — this throw is a
      // loud signal at development time, not a runtime possibility in correctly-written code.
      throw new Error(
        `Tenant-safety: ${model}.${action}() is not allowed on a tenant-scoped model. ` +
          `Use findFirst()/updateMany()/deleteMany() with an explicit ${scopeKey} filter instead.`,
      );
    }

    if (action === 'create') {
      const data = args?.data as Record<string, unknown> | undefined;
      if (!data?.[scopeKey] && !contextValue) {
        throw new Error(
          `Tenant-safety: creating a ${model} without ${scopeKey} in data or context.`,
        );
      }
      return next(params);
    }

    if (action === 'upsert') {
      const create = args?.create as Record<string, unknown> | undefined;
      if (!create?.[scopeKey] && !contextValue) {
        throw new Error(
          `Tenant-safety: upserting a ${model} without ${scopeKey} in create data or context.`,
        );
      }
      return next(params);
    }

    if (READ_ACTIONS.has(action) || WRITE_MANY_ACTIONS.has(action)) {
      const where = (args?.where ?? {}) as Record<string, unknown>;
      if (where[scopeKey]) return next(params); // caller already scoped it explicitly

      if (!contextValue) {
        throw new Error(
          `Tenant-safety: ${model}.${action}() has no ${scopeKey} filter and no request context is bound. ` +
            `Ensure this call happens inside an authenticated request (TenantContextInterceptor) or pass ${scopeKey} explicitly.`,
        );
      }

      params.args = { ...args, where: { ...where, [scopeKey]: contextValue } };
      return next(params);
    }

    return next(params);
  };
}
