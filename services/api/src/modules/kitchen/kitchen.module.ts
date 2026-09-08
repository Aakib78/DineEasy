import { Module } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { KitchenController } from './kitchen.controller';
import { AuditModule } from '../audit/audit.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [AuditModule, OrdersModule],
  providers: [KitchenService],
  controllers: [KitchenController],
  exports: [KitchenService],
})
export class KitchenModule {}
