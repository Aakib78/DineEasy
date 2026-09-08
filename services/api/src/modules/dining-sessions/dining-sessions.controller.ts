import { Controller, Get, Param, Post } from '@nestjs/common';
import { DiningSessionsService } from './dining-sessions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

/**
 * Staff-facing dining-session endpoints (spec §6/§11) — a live view of which tables are
 * currently occupied, and the explicit "close table" action. Session *creation* happens
 * only via a QR scan (QrService), never from here — staff don't open sessions manually.
 */
@Controller('dining-sessions')
export class DiningSessionsController {
  constructor(private readonly diningSessionsService: DiningSessionsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  listOpen(@CurrentUser() user: AuthenticatedUser) {
    return this.diningSessionsService.listOpenForOutlet(
      user.organizationId,
      requireActiveOutlet(user),
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.diningSessionsService.getById(user.organizationId, id);
  }

  @Post(':id/close')
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.diningSessionsService.close(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      user.userId,
    );
  }
}
