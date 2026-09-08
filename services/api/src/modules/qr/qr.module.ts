import { Module } from '@nestjs/common';
import { QrService } from './qr.service';
import { QrController } from './qr.controller';
import { DiningSessionsModule } from '../dining-sessions/dining-sessions.module';
import { MenuModule } from '../menu/menu.module';

@Module({
  imports: [DiningSessionsModule, MenuModule],
  providers: [QrService],
  controllers: [QrController],
})
export class QrModule {}
