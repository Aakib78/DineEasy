/**
 * The fixed, global catalog of permission keys (spec §22). This is the single source of
 * truth for every permission string used by @RequirePermission(...) guards anywhere in the
 * codebase — never hard-code a permission string inline, always reference PERMISSIONS.*.
 *
 * Seeded into the `permissions` table once (see prisma/seed.ts and RolesService.seedForOrg).
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

export const ALL_PERMISSIONS: { key: PermissionKey; description: string }[] = [
  { key: PERMISSIONS.ORDERS_CREATE, description: 'Create dine-in/takeaway/QR orders' },
  { key: PERMISSIONS.ORDERS_UPDATE, description: 'Modify an existing order (items, notes)' },
  { key: PERMISSIONS.ORDERS_CANCEL, description: 'Cancel an order or order item' },
  { key: PERMISSIONS.ORDERS_DISCOUNT, description: 'Apply a discount to an order' },
  { key: PERMISSIONS.ORDERS_VIEW, description: 'View orders' },
  { key: PERMISSIONS.KITCHEN_VIEW, description: 'View the kitchen display / KOT queue' },
  { key: PERMISSIONS.KITCHEN_UPDATE, description: 'Update kitchen order item preparation status' },
  { key: PERMISSIONS.BILLING_CREATE, description: 'Generate an invoice/bill for an order' },
  { key: PERMISSIONS.BILLING_VIEW, description: 'View invoices' },
  { key: PERMISSIONS.PAYMENTS_TAKE, description: 'Record a payment against an order' },
  { key: PERMISSIONS.PAYMENTS_REFUND, description: 'Approve/process a refund' },
  { key: PERMISSIONS.PAYMENTS_VIEW, description: 'View payment records' },
  {
    key: PERMISSIONS.TABLES_MANAGE,
    description: 'Create/edit floors and tables, manage table status',
  },
  { key: PERMISSIONS.TABLES_VIEW, description: 'View the floor/table layout' },
  {
    key: PERMISSIONS.MENU_EDIT,
    description: 'Create/edit menu categories, items, variants, modifiers',
  },
  { key: PERMISSIONS.MENU_VIEW, description: 'View the menu' },
  { key: PERMISSIONS.REPORTS_VIEW, description: 'View sales/operational reports' },
  { key: PERMISSIONS.STAFF_MANAGE, description: 'Create/edit staff accounts and role assignments' },
  { key: PERMISSIONS.STAFF_VIEW, description: 'View staff accounts' },
  {
    key: PERMISSIONS.SETTINGS_MANAGE,
    description: 'Edit outlet/organization settings, tax, printers',
  },
  { key: PERMISSIONS.AUDIT_VIEW, description: 'View the audit log' },
  { key: PERMISSIONS.PRINTERS_MANAGE, description: 'Configure printers' },
];

/** System role names, matching spec §22 exactly. */
export const SYSTEM_ROLES = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen',
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** Default permission grants for each system role, per spec §22's job descriptions (§36). */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, PermissionKey[]> = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS.map((p) => p.key), // full access
  [SYSTEM_ROLES.MANAGER]: [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.ORDERS_DISCOUNT,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.PAYMENTS_TAKE,
    PERMISSIONS.PAYMENTS_REFUND,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.TABLES_MANAGE,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MENU_EDIT,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.STAFF_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.PRINTERS_MANAGE,
  ],
  [SYSTEM_ROLES.CASHIER]: [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.BILLING_CREATE,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.PAYMENTS_TAKE,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MENU_VIEW,
  ],
  [SYSTEM_ROLES.WAITER]: [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_UPDATE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.TABLES_MANAGE,
    PERMISSIONS.TABLES_VIEW,
    PERMISSIONS.MENU_VIEW,
  ],
  [SYSTEM_ROLES.KITCHEN]: [
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE,
    PERMISSIONS.ORDERS_VIEW,
  ],
};
