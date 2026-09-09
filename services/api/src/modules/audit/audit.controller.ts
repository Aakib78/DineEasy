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
    // `Number('abc')` is NaN, not an error — guarded here (and again in the service) rather
    // than trusting a bare `parseInt` result, which used to flow straight into Prisma's `take`
    // and produce a raw 500 instead of a clean fallback to the default.
    const parsed = limit !== undefined ? Number(limit) : undefined;
    const safeLimit =
      parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    return this.auditLogService.listForOrganization(user.organizationId, safeLimit);
  }
}
