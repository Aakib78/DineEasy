import { TenantContextStore } from './tenant-context';

/**
 * Mimics the one property of Prisma's `PrismaPromise` that matters for the bug this file
 * tests: calling `prisma.model.findMany(...)` does NOT start the query — it just builds a
 * lazy, thenable object. The actual dispatch (and, in the real app, the `$use` middleware
 * read of `TenantContextStore.current` that the tenant guard relies on) only happens once
 * something calls `.then()`/awaits it — which can be an arbitrary number of ticks later than
 * the synchronous call that constructed it. `dispatchedContext` records what
 * `TenantContextStore.current` actually was at the moment `.then()` fires, which is the exact
 * thing `runUnscoped` has to get right.
 */
class LazyThenable<T> implements PromiseLike<T> {
  dispatchedContext: unknown;

  constructor(private readonly value: T) {}

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    // Deferred via a real microtask + macrotask hop (not just Promise.resolve().then(), which
    // some naive AsyncLocalStorage misuses can accidentally survive) to make sure the fix is
    // robust, not just "happens to pass because the deferral was too shallow to expose it".
    return new Promise<TResult1 | TResult2>((resolve, reject) => {
      setImmediate(() => {
        this.dispatchedContext = TenantContextStore.current;
        try {
          resolve(onfulfilled ? onfulfilled(this.value) : (this.value as unknown as TResult1));
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}

describe('TenantContextStore', () => {
  describe('run / current / organizationId / outletId / userId', () => {
    it('has no bound context outside of run()', () => {
      expect(TenantContextStore.current).toBeUndefined();
      expect(TenantContextStore.organizationId).toBeUndefined();
    });

    it('exposes the bound data via the typed getters inside run()', () => {
      TenantContextStore.run(
        { organizationId: 'org_1', outletId: 'outlet_1', userId: 'user_1' },
        () => {
          expect(TenantContextStore.organizationId).toBe('org_1');
          expect(TenantContextStore.outletId).toBe('outlet_1');
          expect(TenantContextStore.userId).toBe('user_1');
        },
      );
    });

    it('does not leak context to code outside the run() callback', () => {
      TenantContextStore.run({ organizationId: 'org_1' }, () => {
        /* no-op */
      });
      expect(TenantContextStore.current).toBeUndefined();
    });
  });

  describe('requireOrganizationId', () => {
    it('throws outside a bound context (fail closed)', () => {
      expect(() => TenantContextStore.requireOrganizationId()).toThrow(
        /outside an authenticated request context/,
      );
    });

    it('returns the bound organizationId inside a context that has one', () => {
      TenantContextStore.run({ organizationId: 'org_1' }, () => {
        expect(TenantContextStore.requireOrganizationId()).toBe('org_1');
      });
    });
  });

  describe('runUnscoped', () => {
    // The actual bug (caught on this project's first real HTTP request — see
    // docs/troubleshooting.md): if runUnscoped only *called* fn() and returned the result
    // without awaiting it internally, a lazy thenable's real dispatch would happen after
    // als.run()'s synchronous scope had already ended, so PrismaService's tenant-guard
    // middleware would see no bound context at all and throw, even though the call site did
    // everything right by wrapping in runUnscoped.
    it('keeps bypassTenantGuard bound at the moment a lazy thenable actually dispatches', async () => {
      const lazy = new LazyThenable('candidate-user');
      const result = await TenantContextStore.runUnscoped(() => lazy);

      expect(result).toBe('candidate-user');
      expect(lazy.dispatchedContext).toEqual(expect.objectContaining({ bypassTenantGuard: true }));
    });

    it('merges bypassTenantGuard onto an already-bound context rather than replacing it', async () => {
      await TenantContextStore.run({ organizationId: 'org_1', userId: 'user_1' }, async () => {
        const lazy = new LazyThenable('ok');
        await TenantContextStore.runUnscoped(() => lazy);

        expect(lazy.dispatchedContext).toEqual(
          expect.objectContaining({
            organizationId: 'org_1',
            userId: 'user_1',
            bypassTenantGuard: true,
          }),
        );
      });
    });

    it('does not leave bypassTenantGuard bound after it returns', async () => {
      await TenantContextStore.runUnscoped(() => 'value');
      expect(TenantContextStore.current?.bypassTenantGuard).toBeUndefined();
    });

    it('also works for an already-resolved plain value (not just a lazy thenable)', async () => {
      await expect(TenantContextStore.runUnscoped(() => 42)).resolves.toBe(42);
    });

    it('propagates a rejection from the wrapped operation', async () => {
      await expect(
        TenantContextStore.runUnscoped(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    });
  });
});
