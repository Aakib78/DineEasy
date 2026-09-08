import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission(PERMISSIONS.AUDIT_VIEW)
  list(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.auditLogService.listForOrganization(
      user.organizationId,
      limit ? parseInt(limit, 10) : undefined,
    );
  }
}
