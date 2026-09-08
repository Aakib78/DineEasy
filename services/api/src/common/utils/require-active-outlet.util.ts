import { ValidationDomainError } from '../errors/domain-errors';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

/**
 * Most operational routes (menu, tables, tax, orders, ...) act on "the current outlet".
 * A user with an org-wide role only (Owner, in v1 practice — see AuthService's
 * resolveActiveOutlet) has no implicit active outlet and must be handled explicitly by the
 * client (outlet picker) rather than crashing on `undefined` reaching a query. This throws a
 * clear, actionable 400 instead of letting `undefined` silently reach Prisma.
 */
export function requireActiveOutlet(user: AuthenticatedUser): string {
  if (!user.activeOutletId) {
    throw new ValidationDomainError(
      'No active outlet selected. Select an outlet before performing this action.',
    );
  }
  return user.activeOutletId;
}
