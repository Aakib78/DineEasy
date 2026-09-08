import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

/**
 * No `@RequirePermission(...)` anywhere here, deliberately — a staff member's own notification
 * inbox isn't gated behind the permission catalog the way most routes are (see
 * `PermissionsGuard`'s doc comment: a route with none declared is "authenticated-only"). Every
 * signed-in staff member can read and dismiss their own notifications regardless of role;
 * `NotificationsService`'s visibility filter is what actually decides *which* rows they see.
 *
 * There is no `POST /notifications` — staff never create their own; every notification is
 * written by a domain service reacting to a real state change (`NotificationsService`'s class
 * doc comment), the same way there's no `POST /audit-logs`.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('unread') unread?: string) {
    return this.notificationsService.listForUser(
      user.organizationId,
      requireActiveOutlet(user),
      user,
      { unreadOnly: unread === 'true' },
    );
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService
      .unreadCount(user.organizationId, requireActiveOutlet(user), user)
      .then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      user,
    );
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(
      user.organizationId,
      requireActiveOutlet(user),
      user,
    );
  }
}
