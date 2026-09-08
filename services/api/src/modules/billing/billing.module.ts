import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [AuditModule, OrdersModule],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
