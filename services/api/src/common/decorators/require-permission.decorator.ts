import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../rbac/permissions.catalog';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Marks a route handler as requiring the given permission (spec §22/§31: authorization
 * enforced on the backend, never a hard-coded role check). Read by PermissionsGuard.
 *
 * @example @RequirePermission(PERMISSIONS.ORDERS_CANCEL)
 */
export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(PERMISSION_KEY, permission);
