import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GuestTokenService } from '../guest-auth/guest-token.service';
import { UnauthenticatedDomainError } from '../errors/domain-errors';

/**
 * Applied explicitly (`@UseGuards(DiningSessionGuard)`) on customer/QR-facing routes, which
 * are also marked `@Public()` to skip the staff JwtAuthGuard. Verifies the dining-session
 * bearer token and attaches it as `request.diningSession`, which TenantContextInterceptor
 * then binds into TenantContextStore just like a staff user — see docs/qr-ordering.md.
 */
@Injectable()
export class DiningSessionGuard implements CanActivate {
  constructor(private readonly guestTokenService: GuestTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthenticatedDomainError('Missing dining session token — please scan the table QR code.');
    }

    const token = authHeader.slice('Bearer '.length);
    request.diningSession = this.guestTokenService.verify(token);
    return true;
  }
}
