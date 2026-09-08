import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateGuestOrderDto } from './dto/create-guest-order.dto';
import { Public } from '../../common/decorators/public.decorator';
import { DiningSessionGuard } from '../../common/guards/dining-session.guard';
import { CurrentDiningSession } from '../../common/decorators/current-dining-session.decorator';
import { GuestSessionPayload } from '../../common/guest-auth/guest-session.type';
import { ForbiddenDomainError } from '../../common/errors/domain-errors';

/**
 * The QR customer entry point into the same order domain OrdersController uses (spec §7 "one
 * unified Order model"). `table`/`type`/`diningSessionId`/`guestToken` all come from the
 * verified dining-session token, never the request body — see CreateGuestOrderDto.
 */
@Controller('qr/orders')
@UseGuards(DiningSessionGuard)
@Public()
export class OrdersGuestController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentDiningSession() session: GuestSessionPayload, @Body() dto: CreateGuestOrderDto) {
    return this.ordersService.createOrder(
      session.organizationId,
      session.outletId,
      'QR',
      { type: 'DINE_IN', tableId: session.tableId, notes: dto.notes, items: dto.items },
      { diningSessionId: session.diningSessionId, guestToken: session.guestToken },
    );
  }

  /** A guest can only ever look up an order that belongs to their own dining session. */
  @Get(':id')
  async getById(@CurrentDiningSession() session: GuestSessionPayload, @Param('id') id: string) {
    const order = await this.ordersService.getById(session.organizationId, session.outletId, id);
    if (order.diningSessionId !== session.diningSessionId) {
      throw new ForbiddenDomainError('This order does not belong to your table.');
    }
    return order;
  }
}
