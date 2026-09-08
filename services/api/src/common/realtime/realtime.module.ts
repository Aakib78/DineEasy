import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/** @Global so any domain service can inject RealtimeGateway to emit a refetch hint without every module explicitly importing this one. */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
