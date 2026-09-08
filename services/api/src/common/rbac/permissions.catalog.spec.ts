import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from './permissions.catalog';

describe('permissions catalog', () => {
  const knownKeys = new Set(ALL_PERMISSIONS.map((p) => p.key));

  it('every PERMISSIONS.* constant appears in ALL_PERMISSIONS', () => {
    for (const key of Object.values(PERMISSIONS)) {
      expect(knownKeys.has(key)).toBe(true);
    }
  });

  it('ALL_PERMISSIONS has no duplicate keys', () => {
    const keys = ALL_PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every system role only grants keys from the known catalog', () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      for (const key of SYSTEM_ROLE_PERMISSIONS[role]) {
        expect(knownKeys.has(key)).toBe(true);
      }
    }
  });

  it('Owner is granted every permission (full access, per spec §22)', () => {
    expect(new Set(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]).size).toBe(ALL_PERMISSIONS.length);
  });

  it('Kitchen role is not granted billing/payment/staff permissions', () => {
    const kitchenPermissions = new Set(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.KITCHEN]);
    expect(kitchenPermissions.has(PERMISSIONS.PAYMENTS_REFUND)).toBe(false);
    expect(kitchenPermissions.has(PERMISSIONS.STAFF_MANAGE)).toBe(false);
    expect(kitchenPermissions.has(PERMISSIONS.BILLING_CREATE)).toBe(false);
  });

  it('every role name has a permission list defined', () => {
    for (const role of Object.values(SYSTEM_ROLES)) {
      expect(SYSTEM_ROLE_PERMISSIONS[role]).toBeDefined();
      expect(SYSTEM_ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
