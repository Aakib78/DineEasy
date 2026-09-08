import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrdersGuestController } from './orders-guest.controller';
import { AuditModule } from '../audit/audit.module';
import { TablesModule } from '../tables/tables.module';
import { DiningSessionsModule } from '../dining-sessions/dining-sessions.module';

@Module({
  imports: [AuditModule, TablesModule, DiningSessionsModule],
  providers: [OrdersService],
  controllers: [OrdersController, OrdersGuestController],
  exports: [OrdersService],
})
export class OrdersModule {}
