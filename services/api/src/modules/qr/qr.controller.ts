import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { QrService } from './qr.service';
import { Public } from '../../common/decorators/public.decorator';
import { DiningSessionGuard } from '../../common/guards/dining-session.guard';
import { CurrentDiningSession } from '../../common/decorators/current-dining-session.decorator';
import { GuestSessionPayload } from '../../common/guest-auth/guest-session.type';

/**
 * The only controller in the system that serves anonymous, unauthenticated diners directly
 * (spec §4 "no forced signup"). `@Public()` skips the staff JwtAuthGuard; the menu route
 * additionally requires a valid dining-session token via `DiningSessionGuard`, so a phone
 * that never scanned a table QR can resolve nothing beyond the initial handshake.
 */
@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  /** Step 1: scan the table QR → resolve the opaque token into a dining-session token. */
  @Public()
  @Post(':token/resolve')
  resolve(@Param('token') token: string) {
    return this.qrService.resolveTokenAndJoinSession(token);
  }

  /** Step 2 onward: every customer PWA request carries the dining-session bearer token. */
  @Public()
  @UseGuards(DiningSessionGuard)
  @Get('menu')
  getMenu(@CurrentDiningSession() diningSession: GuestSessionPayload) {
    return this.qrService.getMenuForSession(diningSession.outletId);
  }
}
