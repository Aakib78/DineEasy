/// Mirrors `PERMISSIONS` in `services/api/src/common/rbac/permissions.catalog.ts`. Keep the
/// two lists in sync by hand for now — v1 has no shared-types codegen pipeline for Dart (see
/// docs/architecture.md §13; `packages/shared_types` only serves the TypeScript customer web
/// app so far).
///
/// IMPORTANT: this list is for *client-side UI gating only* — hiding a "Void order" button
/// from a Waiter makes for a better app, but it is not what stops a Waiter from voiding an
/// order. That enforcement is `PermissionsGuard` on the server, on every request, unconditionally.
/// Never treat a check against this list as a security boundary.
class Permissions {
  const Permissions._();

  static const ordersCreate = 'orders.create';
  static const ordersUpdate = 'orders.update';
  static const ordersCancel = 'orders.cancel';
  static const ordersDiscount = 'orders.discount';
  static const ordersView = 'orders.view';

  static const kitchenView = 'kitchen.view';
  static const kitchenUpdate = 'kitchen.update';

  static const billingCreate = 'billing.create';
  static const billingView = 'billing.view';

  static const paymentsTake = 'payments.take';
  static const paymentsRefund = 'payments.refund';
  static const paymentsView = 'payments.view';

  static const tablesManage = 'tables.manage';
  static const tablesView = 'tables.view';

  static const menuEdit = 'menu.edit';
  static const menuView = 'menu.view';

  static const reportsView = 'reports.view';

  static const staffManage = 'staff.manage';
  static const staffView = 'staff.view';

  static const settingsManage = 'settings.manage';

  static const auditView = 'audit.view';

  static const printersManage = 'printers.manage';
}
