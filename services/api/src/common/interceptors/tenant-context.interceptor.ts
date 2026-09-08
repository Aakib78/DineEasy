import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextStore } from '../context/tenant-context';
import { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type';

/**
 * Runs AFTER guards (JwtAuthGuard/DiningSessionGuard have already verified the token and
 * attached `request.user` / `request.diningSession`), and BEFORE the route handler. Binds
 * the tenant identity for the rest of this request's async call chain — every PrismaService
 * query and every AuditLogService write for this request sees it via TenantContextStore,
 * without threading organizationId through every function signature by hand.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'];

    const user: AuthenticatedUser | undefined = request.user;
    const diningSession = request.diningSession;

    const tenantData = user
      ? {
          organizationId: user.organizationId,
          outletId: user.activeOutletId,
          userId: user.userId,
          isGuest: false,
          requestId,
        }
      : diningSession
        ? {
            organizationId: diningSession.organizationId,
            outletId: diningSession.outletId,
            isGuest: true,
            requestId,
          }
        : { requestId };

    return new Observable((subscriber) => {
      TenantContextStore.run(tenantData, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
