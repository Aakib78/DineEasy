import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { InitiateRefundDto } from './dto/initiate-refund.dto';
import { ProviderWebhookDto } from './dto/provider-webhook.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('orders/:orderId/payments')
  @RequirePermission(PERMISSIONS.PAYMENTS_TAKE)
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.paymentsService.recordPayment(
      user.organizationId,
      requireActiveOutlet(user),
      orderId,
      dto,
      user.userId,
    );
  }

  @Get('orders/:orderId/payments')
  @RequirePermission(PERMISSIONS.PAYMENTS_VIEW)
  list(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.paymentsService.listForOrder(
      user.organizationId,
      requireActiveOutlet(user),
      orderId,
    );
  }

  @Post('payments/:id/refund')
  @RequirePermission(PERMISSIONS.PAYMENTS_REFUND)
  initiateRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: InitiateRefundDto,
  ) {
    return this.paymentsService.initiateRefund(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }

  @Post('payments/refunds/:id/approve')
  @RequirePermission(PERMISSIONS.PAYMENTS_REFUND)
  approveRefund(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.approveRefund(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      user.userId,
    );
  }

  /** See ProviderWebhookDto — unused by any real provider in v1, but wired end-to-end. */
  @Public()
  @Post('payments/webhook/:provider')
  webhook(@Param('provider') provider: string, @Body() dto: ProviderWebhookDto) {
    return this.paymentsService.handleProviderWebhook(provider, dto);
  }
}
