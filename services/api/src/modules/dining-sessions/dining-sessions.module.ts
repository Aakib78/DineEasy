import { Module } from '@nestjs/common';
import { DiningSessionsService } from './dining-sessions.service';
import { DiningSessionsController } from './dining-sessions.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [DiningSessionsService],
  controllers: [DiningSessionsController],
  exports: [DiningSessionsService],
})
export class DiningSessionsModule {}
