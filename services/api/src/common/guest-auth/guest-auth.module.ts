import { Global, Module } from '@nestjs/common';
import { GuestTokenService } from './guest-token.service';

@Global()
@Module({
  providers: [GuestTokenService],
  exports: [GuestTokenService],
})
export class GuestAuthModule {}
