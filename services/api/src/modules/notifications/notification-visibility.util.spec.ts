import { buildNotificationVisibilityWhere } from './notification-visibility.util';

describe('buildNotificationVisibilityWhere', () => {
  const org = 'org-1';
  const outlet = 'outlet-1';

  it('scopes to the given organization and outlet', () => {
    const where = buildNotificationVisibilityWhere(org, outlet, {
      userId: 'u-1',
      permissions: [],
    });
    expect(where.organizationId).toBe(org);
    expect(where.outletId).toBe(outlet);
  });

  it('includes an OR branch matching notifications addressed to this user', () => {
    const where = buildNotificationVisibilityWhere(org, outlet, {
      userId: 'u-1',
      permissions: [],
    });
    expect(where.OR).toContainEqual({ recipientUserId: 'u-1' });
  });

  // The broadcast branch is always OR[1] — buildNotificationVisibilityWhere's own
  // implementation returns exactly two OR entries in that fixed order (the addressed-to-me
  // branch first, the broadcast branch second), so indexing it directly here is simpler and
  // less brittle than a hand-written type predicate trying to re-describe that shape.
  function broadcastBranch(where: ReturnType<typeof buildNotificationVisibilityWhere>) {
    return where.OR[1];
  }

  it('includes an unrestricted-broadcast option (requiredPermission null)', () => {
    const where = buildNotificationVisibilityWhere(org, outlet, {
      userId: 'u-1',
      permissions: [],
    });
    expect(broadcastBranch(where).recipientUserId).toBeNull();
    expect(broadcastBranch(where).OR).toContainEqual({ requiredPermission: null });
  });

  it("includes the user's own permissions in the gated-broadcast option", () => {
    const where = buildNotificationVisibilityWhere(org, outlet, {
      userId: 'u-1',
      permissions: ['orders.view', 'billing.view'],
    });
    expect(broadcastBranch(where).OR).toContainEqual({
      requiredPermission: { in: ['orders.view', 'billing.view'] },
    });
  });

  it('reflects an empty permission set as-is rather than substituting a default', () => {
    const where = buildNotificationVisibilityWhere(org, outlet, {
      userId: 'u-1',
      permissions: [],
    });
    expect(broadcastBranch(where).OR).toContainEqual({ requiredPermission: { in: [] } });
  });
});
