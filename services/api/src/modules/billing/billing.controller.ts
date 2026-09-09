import { Controller, Get, Param, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('orders/:orderId/invoice')
  @RequirePermission(PERMISSIONS.BILLING_CREATE)
  generate(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.billingService.generateInvoice(
      user.organizationId,
      requireActiveOutlet(user),
      orderId,
      user.userId,
    );
  }

  @Get('orders/:orderId/invoice')
  @RequirePermission(PERMISSIONS.BILLING_VIEW)
  getByOrder(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.billingService.getByOrderId(user.organizationId, orderId);
  }

  @Get('invoices/:id')
  @RequirePermission(PERMISSIONS.BILLING_VIEW)
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.billingService.getById(user.organizationId, id);
  }

  // Gated on BILLING_VIEW, not BILLING_CREATE — printing doesn't create or change anything
  // financial, it just re-sends the same receipt ticket to the printer, so anyone who can
  // already see the bill can ask for a physical copy of it.
  @Post('invoices/:id/print')
  @RequirePermission(PERMISSIONS.BILLING_VIEW)
  print(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.billingService.printInvoice(user.organizationId, id, user.userId);
  }
}
