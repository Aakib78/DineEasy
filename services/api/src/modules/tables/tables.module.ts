import { Module } from '@nestjs/common';
import { TablesService } from './tables.service';
import { TablesController } from './tables.controller';
import { AuditModule } from '../audit/audit.module';
import { DiningSessionsModule } from '../dining-sessions/dining-sessions.module';

@Module({
  imports: [AuditModule, DiningSessionsModule],
  providers: [TablesService],
  controllers: [TablesController],
  exports: [TablesService],
})
export class TablesModule {}
