import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportRangeDto } from './dto/report-range.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller('reports')
@RequirePermission(PERMISSIONS.REPORTS_VIEW)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales-summary')
  salesSummary(@CurrentUser() user: AuthenticatedUser, @Query() range: ReportRangeDto) {
    return this.reportsService.salesSummary(user.organizationId, requireActiveOutlet(user), range);
  }

  @Get('top-items')
  topItems(@CurrentUser() user: AuthenticatedUser, @Query() range: ReportRangeDto) {
    return this.reportsService.topItems(user.organizationId, requireActiveOutlet(user), range);
  }

  @Get('payment-breakdown')
  paymentBreakdown(@CurrentUser() user: AuthenticatedUser, @Query() range: ReportRangeDto) {
    return this.reportsService.paymentBreakdown(
      user.organizationId,
      requireActiveOutlet(user),
      range,
    );
  }
}
