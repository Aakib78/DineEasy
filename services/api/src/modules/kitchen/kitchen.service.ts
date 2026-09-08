import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { OrdersService } from '../orders/orders.service';
import { RealtimeGateway } from '../../common/realtime/realtime.gateway';
import { CreateKitchenStationDto } from './dto/create-station.dto';
import { UpdateKitchenItemStatusDto } from './dto/update-kitchen-item-status.dto';
import {
  KitchenItemStatus,
  OrderStatus,
  assertKitchenItemTransition,
} from '../../common/order/order-state-machine';

/** The order statuses the kitchen is allowed to drive forward — see recomputeOrderStatus. */
const KITCHEN_DRIVEN_PATH: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

/**
 * KOT/KDS domain (spec §8). KitchenService only ever *reads* KitchenOrder/KitchenOrderItem
 * and derives Order.status from item-level progress — the KOTs themselves are created by
 * OrdersService, in the same transaction as the order mutation that produced them, so a KOT
 * can never exist for an order that failed to place. See OrdersModule/OrdersService for why
 * the dependency runs this direction only (Kitchen -> Orders) and not the reverse.
 */
@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly ordersService: OrdersService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---------------------------------------------------------------------
  // KDS queue
  // ---------------------------------------------------------------------

  /** Every KOT with at least one item still in play — the live kitchen display feed. */
  async listQueue(organizationId: string, outletId: string, stationId?: string) {
    return this.prisma.kitchenOrder.findMany({
      where: {
        organizationId,
        outletId,
        ...(stationId ? { stationId } : {}),
        items: { some: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
      },
      include: {
        items: {
          include: { orderItem: { include: { modifiers: true } } },
          orderBy: { createdAt: 'asc' },
        },
        order: {
          select: {
            orderNumber: true,
            type: true,
            tableId: true,
            table: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateItemStatus(
    organizationId: string,
    outletId: string,
    kitchenOrderItemId: string,
    dto: UpdateKitchenItemStatusDto,
    actorUserId: string,
  ) {
    const item = await this.prisma.kitchenOrderItem.findFirst({
      where: { id: kitchenOrderItemId, kitchenOrder: { organizationId, outletId } },
      include: { kitchenOrder: true },
    });
    if (!item) throw new NotFoundDomainError('KitchenOrderItem', kitchenOrderItemId);

    assertKitchenItemTransition(item.status as KitchenItemStatus, dto.status);

    const timestampField =
      dto.status === 'PREPARING'
        ? 'startedAt'
        : dto.status === 'READY'
          ? 'readyAt'
          : dto.status === 'COMPLETED'
            ? 'completedAt'
            : undefined;

    await this.prisma.kitchenOrderItem.updateMany({
      where: { id: kitchenOrderItemId },
      data: { status: dto.status, ...(timestampField ? { [timestampField]: new Date() } : {}) },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'kitchen_item.status_changed',
      entityType: 'KitchenOrderItem',
      entityId: kitchenOrderItemId,
      previousState: { status: item.status },
      newState: { status: dto.status },
    });

    await this.recomputeOrderStatus(organizationId, outletId, item.kitchenOrder.orderId);

    // recomputeOrderStatus already emits an order.updated hint if the order's own status
    // moved; this covers the common case where an item's sub-status changed without that
    // (e.g. a second item on an already-PREPARING ticket reaching READY).
    this.realtime.kitchenQueueUpdated(outletId);
    this.realtime.orderUpdated(outletId, item.kitchenOrder.orderId);

    return this.prisma.kitchenOrderItem.findFirst({ where: { id: kitchenOrderItemId } });
  }

  /**
   * PREPARING/READY are never set directly by a client — they're derived from the kitchen
   * item statuses underneath the order, exactly once per relevant status change (spec §8:
   * "the order status reflects what's actually happening in the kitchen, not a separate
   * staff-declared flag that can drift out of sync with it").
   */
  private async recomputeOrderStatus(organizationId: string, outletId: string, orderId: string) {
    const order = await this.ordersService.getById(organizationId, outletId, orderId);
    if (!KITCHEN_DRIVEN_PATH.includes(order.status as OrderStatus)) return;

    const items = await this.prisma.kitchenOrderItem.findMany({
      where: { kitchenOrder: { orderId } },
    });
    const relevant = items.filter((i) => i.status !== 'CANCELLED');
    if (relevant.length === 0) return;

    const allDone = relevant.every((i) => i.status === 'READY' || i.status === 'COMPLETED');
    const anyStarted = relevant.some((i) => i.status !== 'NEW');

    if (allDone) {
      await this.advanceOrderTo(organizationId, outletId, orderId, 'READY');
    } else if (anyStarted) {
      await this.advanceOrderTo(organizationId, outletId, orderId, 'PREPARING');
    }
  }

  private async advanceOrderTo(
    organizationId: string,
    outletId: string,
    orderId: string,
    target: OrderStatus,
  ) {
    const current = (await this.ordersService.getById(organizationId, outletId, orderId))
      .status as OrderStatus;
    const currentIdx = KITCHEN_DRIVEN_PATH.indexOf(current);
    const targetIdx = KITCHEN_DRIVEN_PATH.indexOf(target);
    if (currentIdx === -1 || targetIdx === -1 || targetIdx <= currentIdx) return;

    for (let i = currentIdx + 1; i <= targetIdx; i++) {
      await this.ordersService.setStatusFromSystem(
        organizationId,
        outletId,
        orderId,
        KITCHEN_DRIVEN_PATH[i],
      );
    }
  }

  // ---------------------------------------------------------------------
  // Kitchen stations (v1: configurable, but no menu-item -> station routing yet — see
  // OrdersService.createKitchenOrder)
  // ---------------------------------------------------------------------

  async createStation(
    organizationId: string,
    outletId: string,
    dto: CreateKitchenStationDto,
    actorUserId: string,
  ) {
    const station = await this.prisma.kitchenStation.create({ data: { outletId, name: dto.name } });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'kitchen_station.created',
      entityType: 'KitchenStation',
      entityId: station.id,
      newState: station,
    });

    return station;
  }

  async listStations(outletId: string) {
    return this.prisma.kitchenStation.findMany({
      where: { outletId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
