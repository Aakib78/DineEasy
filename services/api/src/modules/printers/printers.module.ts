import { Module } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { PrintersController } from './printers.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [PrintersService],
  controllers: [PrintersController],
  exports: [PrintersService],
})
export class PrintersModule {}
