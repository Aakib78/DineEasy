import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateStaffOrderDto } from './dto/create-staff-order.dto';
import { AddOrderItemsDto } from './dto/add-order-items.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ListCompletedOrdersDto } from './dto/list-completed-orders.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

/** POS terminal + Flutter Waiter app entry points — see OrdersGuestController for the QR side. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermission(PERMISSIONS.ORDERS_CREATE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffOrderDto) {
    const { source, ...rest } = dto;
    return this.ordersService.createOrder(
      user.organizationId,
      requireActiveOutlet(user),
      source,
      rest,
      {
        userId: user.userId,
      },
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.ORDERS_VIEW)
  listActive(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.listActiveForOutlet(user.organizationId, requireActiveOutlet(user));
  }

  /**
   * Declared before `:id` deliberately — Nest/Express match routes in registration order, so
   * this static path must come first or `/orders/completed` would be swallowed by `:id` (with
   * `id` bound to the literal string "completed") and 404 as an order lookup instead. Backs the
   * Billing screens' "Completed" tab and its date filter (see `ListCompletedOrdersDto` — one
   * calendar day at a time, defaulting to today when `date` is omitted) — this is what makes a
   * "Print bill" reprint reachable again after a cashier navigates away from
   * `BillingDetailScreen` post-payment; see `OrdersService.listCompletedForOutlet`'s doc comment
   * and docs/printing.md.
   */
  @Get('completed')
  @RequirePermission(PERMISSIONS.ORDERS_VIEW)
  listCompleted(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCompletedOrdersDto) {
    return this.ordersService.listCompletedForOutlet(
      user.organizationId,
      requireActiveOutlet(user),
      query.date ? new Date(query.date) : new Date(),
    );
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.ORDERS_VIEW)
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.getById(user.organizationId, requireActiveOutlet(user), id);
  }

  @Post(':id/items')
  @RequirePermission(PERMISSIONS.ORDERS_UPDATE)
  addItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddOrderItemsDto,
  ) {
    return this.ordersService.addItems(user.organizationId, requireActiveOutlet(user), id, dto, {
      userId: user.userId,
    });
  }

  @Post(':id/items/:itemId/cancel')
  @RequirePermission(PERMISSIONS.ORDERS_CANCEL)
  cancelItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.ordersService.cancelItem(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      itemId,
      user.userId,
    );
  }

  @Post(':id/discount')
  @RequirePermission(PERMISSIONS.ORDERS_DISCOUNT)
  applyDiscount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.ordersService.applyDiscount(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }

  @Post(':id/accept')
  @RequirePermission(PERMISSIONS.ORDERS_UPDATE)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.acceptOrder(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      user.userId,
    );
  }

  @Post(':id/serve')
  @RequirePermission(PERMISSIONS.ORDERS_UPDATE)
  serve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ordersService.markServed(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      user.userId,
    );
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.ORDERS_CANCEL)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelOrder(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto.reason,
      user.userId,
    );
  }
}
