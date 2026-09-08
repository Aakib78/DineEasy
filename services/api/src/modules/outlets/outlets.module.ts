import { Module } from '@nestjs/common';
import { OutletsService } from './outlets.service';
import { OutletsController } from './outlets.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [OutletsService],
  controllers: [OutletsController],
  exports: [OutletsService],
})
export class OutletsModule {}
