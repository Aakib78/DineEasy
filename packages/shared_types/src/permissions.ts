/**
 * Mirrors `PERMISSIONS` in `services/api/src/common/rbac/permissions.catalog.ts` — the same
 * fixed, global permission-key catalog, for any TypeScript staff-facing frontend to gate UI
 * with (e.g. `apps/pos_web` hiding "Generate bill" from a user without `BILLING_CREATE`).
 * `apps/restaurant_app/lib/core/rbac/permissions.dart` keeps its own hand-mirrored copy for
 * the same reason `lib/features/pos/data/pos_models.dart` does — Dart can't import this
 * package (see this package's index.ts doc comment) — so all three lists (backend, Dart, this
 * one) must be kept in sync by hand.
 *
 * IMPORTANT: exactly like the Dart copy, this is for *client-side UI gating only*. Hiding a
 * button from a user without the permission makes for a better app; it is not what stops them
 * from calling the endpoint directly. That enforcement is `PermissionsGuard` on the server, on
 * every request, unconditionally — never treat a check against this list as a security boundary.
 */
export const PERMISSIONS = {
  ORDERS_CREATE: 'orders.create',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_DISCOUNT: 'orders.discount',
  ORDERS_VIEW: 'orders.view',

  KITCHEN_VIEW: 'kitchen.view',
  KITCHEN_UPDATE: 'kitchen.update',

  BILLING_CREATE: 'billing.create',
  BILLING_VIEW: 'billing.view',

  PAYMENTS_TAKE: 'payments.take',
  PAYMENTS_REFUND: 'payments.refund',
  PAYMENTS_VIEW: 'payments.view',

  TABLES_MANAGE: 'tables.manage',
  TABLES_VIEW: 'tables.view',

  MENU_EDIT: 'menu.edit',
  MENU_VIEW: 'menu.view',

  REPORTS_VIEW: 'reports.view',

  STAFF_MANAGE: 'staff.manage',
  STAFF_VIEW: 'staff.view',

  SETTINGS_MANAGE: 'settings.manage',

  AUDIT_VIEW: 'audit.view',

  PRINTERS_MANAGE: 'printers.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
