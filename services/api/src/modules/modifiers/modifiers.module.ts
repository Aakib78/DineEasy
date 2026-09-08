import { Module } from '@nestjs/common';
import { ModifiersService } from './modifiers.service';
import { ModifiersController } from './modifiers.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [ModifiersService],
  controllers: [ModifiersController],
  exports: [ModifiersService],
})
export class ModifiersModule {}
