import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { ForbiddenDomainError } from '../errors/domain-errors';
import { PermissionKey } from '../rbac/permissions.catalog';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

/**
 * Enforces @RequirePermission(...). Runs after JwtAuthGuard (order matters — see
 * app.module.ts's APP_GUARD registration), so `request.user` is already populated.
 * A route with no @RequirePermission is allowed through (authenticated-only); this guard
 * only starts checking once a permission is explicitly declared, matching spec §22's
 * "use permissions rather than hard-coded role checks everywhere" — never the inverse
 * (never default to "everything requires no permission" for a route that should have one;
 * code review is expected to catch a missing @RequirePermission on a sensitive route).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    if (!user || !user.permissions.includes(required)) {
      throw new ForbiddenDomainError(`Missing required permission: ${required}`);
    }
    return true;
  }
}
