import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditController } from './audit.controller';

@Module({
  providers: [AuditLogService],
  controllers: [AuditController],
  exports: [AuditLogService],
})
export class AuditModule {}
