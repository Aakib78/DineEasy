import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContextData {
  organizationId?: string;
  outletId?: string;
  userId?: string;
  /** True for QR/customer requests authenticated via a dining-session token, not a staff JWT. */
  isGuest?: boolean;
  requestId?: string;
  /** See TenantContextStore.runUnscoped — an explicit, narrow escape hatch, not a default. */
  bypassTenantGuard?: boolean;
}

/**
 * Request-scoped tenant identity, propagated via AsyncLocalStorage rather than a Nest
 * REQUEST-scoped provider (which would force every injected service down the chain into
 * request scope, hurting performance). Populated by TenantContextInterceptor from the
 * verified JWT/session — NEVER from a client-supplied body/query field. See
 * docs/architecture.md §3.
 */
export class TenantContextStore {
  private static readonly als = new AsyncLocalStorage<TenantContextData>();

  static run<T>(data: TenantContextData, fn: () => T): T {
    return this.als.run(data, fn);
  }

  static get current(): TenantContextData | undefined {
    return this.als.getStore();
  }

  static get organizationId(): string | undefined {
    return this.als.getStore()?.organizationId;
  }

  static get outletId(): string | undefined {
    return this.als.getStore()?.outletId;
  }

  static get userId(): string | undefined {
    return this.als.getStore()?.userId;
  }

  /** Throws if no organizationId is bound to the current request — fail closed, never open. */
  static requireOrganizationId(): string {
    const id = this.organizationId;
    if (!id) {
      throw new Error(
        'TenantContextStore.requireOrganizationId() called outside an authenticated request context',
      );
    }
    return id;
  }

  /**
   * Explicit, narrow escape hatch from PrismaService's tenant guard (see
   * infrastructure/prisma/prisma.service.ts) for the handful of genuinely pre-tenant
   * operations: login-by-email (we don't know which org yet), QR token resolution (the
   * token IS the tenant lookup), and system bootstrap/seeding. Every call site MUST be able
   * to justify, in a comment, why the query it wraps cannot leak cross-tenant data despite
   * skipping the guard (e.g. "returns only a password hash to compare, never a data listing").
   * Grep for `runUnscoped` in code review — every usage should be rare and obviously scoped.
   */
  static runUnscoped<T>(fn: () => T): T {
    const current = this.current ?? {};
    return this.als.run({ ...current, bypassTenantGuard: true }, fn);
  }
}
