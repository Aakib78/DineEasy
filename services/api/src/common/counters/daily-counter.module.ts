import { Global, Module } from '@nestjs/common';
import { DailyCounterService } from './daily-counter.service';

/** @Global because Orders, Kitchen, and Billing all need it and it has no state of its own. */
@Global()
@Module({
  providers: [DailyCounterService],
  exports: [DailyCounterService],
})
export class DailyCounterModule {}
