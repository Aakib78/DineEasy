import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError, ValidationDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { DailyCounterService } from '../../common/counters/daily-counter.service';
import { TablesService } from '../tables/tables.service';
import { DiningSessionsService } from '../dining-sessions/dining-sessions.service';
import { RealtimeGateway } from '../../common/realtime/realtime.gateway';
import { PrintersService } from '../printers/printers.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  OrderStatus,
  assertOrderTransition,
  isOrderFinanciallySettled,
  ORDER_FINANCIALLY_SETTLED_STATUSES,
} from '../../common/order/order-state-machine';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { AddOrderItemsDto } from './dto/add-order-items.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { computeDiscountAmount, computeOrderTotals, priceOrderItem } from './order-pricing.util';
import { startOfDay } from '../reports/reports.service';

type OrderSource = 'POS' | 'WAITER' | 'QR';
type OrderActorType = 'STAFF' | 'SYSTEM' | 'CUSTOMER';

interface OrderActor {
  userId?: string;
  diningSessionId?: string;
  guestToken?: string;
}

const ORDER_INCLUDE = {
  items: { include: { modifiers: true }, orderBy: { createdAt: 'asc' as const } },
  discounts: true,
  payments: true,
  invoice: true,
  table: true,
  kitchenOrders: { include: { items: true } },
};

/**
 * The unified order domain (spec §7/§8/§31): POS, Waiter, and QR all create/mutate the
 * *same* Order model through this one service — there is no separate "QR order" type that
 * could drift out of sync with what the kitchen/billing/payments pipeline understands. The
 * only thing that varies per entry point is `source` and which actor identity is available
 * (a staff `userId` vs. a guest `diningSessionId`/`guestToken`) — both are always passed in
 * explicitly by the caller, never inferred from ambient state.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly dailyCounter: DailyCounterService,
    private readonly tablesService: TablesService,
    private readonly diningSessionsService: DiningSessionsService,
    private readonly realtime: RealtimeGateway,
    private readonly printersService: PrintersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------

  async createOrder(
    organizationId: string,
    outletId: string,
    source: OrderSource,
    dto: CreateOrderDto,
    actor: OrderActor,
  ) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { organizationId, outletId, idempotencyKey: dto.idempotencyKey },
        include: ORDER_INCLUDE,
      });
      if (existing) return existing; // retried request — return the original, don't duplicate
    }

    let diningSessionId = actor.diningSessionId;

    if (dto.type === 'DINE_IN') {
      if (!dto.tableId) throw new ValidationDomainError('tableId is required for a dine-in order');
      await this.tablesService.getTableById(outletId, dto.tableId); // ownership check, 404s otherwise
      if (!diningSessionId) {
        const session = await this.diningSessionsService.findOrCreateOpenSession(
          organizationId,
          outletId,
          dto.tableId,
        );
        diningSessionId = session.id;
      }
    }

    let kotNumber: string | undefined;

    const order = await this.prisma.$transaction(async (tx) => {
      const outlet = await tx.outlet.findFirst({ where: { id: outletId, organizationId } });
      if (!outlet) throw new NotFoundDomainError('Outlet', outletId);

      const prepared = await this.priceItems(tx, outletId, dto.items);
      const totals = computeOrderTotals({
        itemSubtotals: prepared.map((p) => p.priced.subtotal),
        itemTaxes: prepared.map((p) => p.priced.taxAmount),
        discountTotal: new Decimal(0),
        serviceChargePercent: new Decimal(outlet.serviceChargePercent.toString()),
        roundOffEnabled: outlet.roundOffEnabled,
      });

      const orderNumber = await this.dailyCounter.next(tx, outletId, 'ORDER');

      const created = await tx.order.create({
        data: {
          organizationId,
          outletId,
          orderNumber,
          source,
          type: dto.type,
          status: 'PLACED',
          tableId: dto.type === 'DINE_IN' ? dto.tableId : null,
          diningSessionId: dto.type === 'DINE_IN' ? diningSessionId : null,
          guestToken: actor.guestToken,
          createdByUserId: actor.userId,
          idempotencyKey: dto.idempotencyKey,
          notes: dto.notes,
          placedAt: new Date(),
          subtotal: totals.subtotal.toString(),
          discountTotal: totals.discountTotal.toString(),
          taxTotal: totals.taxTotal.toString(),
          serviceChargeTotal: totals.serviceChargeTotal.toString(),
          roundOff: totals.roundOff.toString(),
          total: totals.total.toString(),
        },
      });

      const createdItems = await this.persistOrderItems(tx, created.id, prepared);

      await tx.orderEvent.create({
        data: {
          orderId: created.id,
          actorUserId: actor.userId,
          actorType: source === 'QR' ? 'CUSTOMER' : ('STAFF' as OrderActorType),
          fromStatus: null,
          toStatus: 'PLACED',
        },
      });

      const kitchenOrder = await this.createKitchenOrder(
        tx,
        organizationId,
        outletId,
        created.id,
        createdItems,
        false,
      );
      kotNumber = kitchenOrder?.kotNumber;

      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId: actor.userId,
      action: 'order.created',
      entityType: 'Order',
      entityId: order.id,
      newState: { orderNumber: order.orderNumber, source, total: order.total.toString() },
    });

    this.realtime.orderUpdated(outletId, order.id, order.diningSessionId);
    this.realtime.kitchenQueueUpdated(outletId);

    if (kotNumber) {
      const printed = await this.getById(organizationId, outletId, order.id);
      await this.printersService.enqueueForType(outletId, 'KITCHEN', {
        kotNumber,
        orderNumber: order.orderNumber,
        tableName: printed.table?.name,
        isModification: false,
        items: printed.items.map((i) => ({
          name: i.nameSnapshot,
          quantity: i.quantity,
          notes: i.notes,
        })),
      });
    }

    return this.getById(organizationId, outletId, order.id);
  }

  async addItems(
    organizationId: string,
    outletId: string,
    orderId: string,
    dto: AddOrderItemsDto,
    actor: OrderActor,
  ) {
    const order = await this.getById(organizationId, outletId, orderId);
    if (!['PLACED', 'ACCEPTED', 'PREPARING'].includes(order.status)) {
      throw new ValidationDomainError(
        `Cannot add items to an order that is already ${order.status}`,
      );
    }

    let kotNumber: string | undefined;
    let addedItemIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const prepared = await this.priceItems(tx, outletId, dto.items);
      const createdItems = await this.persistOrderItems(tx, orderId, prepared);
      addedItemIds = createdItems.map((i) => i.id);
      const kitchenOrder = await this.createKitchenOrder(
        tx,
        organizationId,
        outletId,
        orderId,
        createdItems,
        true,
      );
      kotNumber = kitchenOrder?.kotNumber;
      await this.recalcTotals(tx, organizationId, outletId, orderId);
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId: actor.userId,
      action: 'order.items_added',
      entityType: 'Order',
      entityId: orderId,
      newState: { addedItemCount: dto.items.length },
    });

    // The new items' KOT is fresh work for the kitchen — if the table had already reached
    // READY (everything previously plated), reopen it rather than leaving READY stale while
    // an un-prepared item sits underneath it. See the READY->PREPARING comment in
    // order-state-machine.ts.
    if (order.status === 'READY') {
      await this.transitionStatus(
        organizationId,
        outletId,
        orderId,
        'PREPARING',
        actor.userId,
        'SYSTEM',
      );
    }

    this.realtime.orderUpdated(outletId, orderId, order.diningSessionId);
    this.realtime.kitchenQueueUpdated(outletId);

    if (kotNumber) {
      const printed = await this.getById(organizationId, outletId, orderId);
      const addedItems = printed.items.filter((i) => addedItemIds.includes(i.id));
      await this.printersService.enqueueForType(outletId, 'KITCHEN', {
        kotNumber,
        orderNumber: printed.orderNumber,
        tableName: printed.table?.name,
        isModification: true,
        items: addedItems.map((i) => ({
          name: i.nameSnapshot,
          quantity: i.quantity,
          notes: i.notes,
        })),
      });
    }

    return this.getById(organizationId, outletId, orderId);
  }

  // ---------------------------------------------------------------------
  // Item / discount mutation
  // ---------------------------------------------------------------------

  async cancelItem(
    organizationId: string,
    outletId: string,
    orderId: string,
    itemId: string,
    actorUserId: string,
  ) {
    const order = await this.getById(organizationId, outletId, orderId);
    // Deliberately BILLED + ORDER_FINANCIALLY_SETTLED_STATUSES rather than that constant alone:
    // once a bill exists, line items are frozen even before payment, since the bill already
    // reflects them — a stricter rule than "has money actually moved" (see the constant's doc
    // comment in order-state-machine.ts for the full contrast with applyDiscount below).
    const itemsLockedFrom: OrderStatus[] = ['BILLED', ...ORDER_FINANCIALLY_SETTLED_STATUSES];
    if (itemsLockedFrom.includes(order.status as OrderStatus)) {
      throw new ValidationDomainError(`Cannot cancel an item once the order is ${order.status}`);
    }
    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundDomainError('OrderItem', itemId);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { id: itemId, orderId },
        data: { isCancelled: true },
      });
      await tx.kitchenOrderItem.updateMany({
        where: { orderItemId: itemId },
        data: { status: 'CANCELLED' },
      });
      await this.recalcTotals(tx, organizationId, outletId, orderId);
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'order_item.cancelled',
      entityType: 'OrderItem',
      entityId: itemId,
    });

    this.realtime.orderUpdated(outletId, orderId, order.diningSessionId);
    this.realtime.kitchenQueueUpdated(outletId);

    return this.getById(organizationId, outletId, orderId);
  }

  /** v1 supports at most one discount per order — see docs/architecture.md §7 for the rationale. */
  async applyDiscount(
    organizationId: string,
    outletId: string,
    orderId: string,
    dto: ApplyDiscountDto,
    actorUserId: string,
  ) {
    const order = await this.getById(organizationId, outletId, orderId);
    if (isOrderFinanciallySettled(order.status as OrderStatus)) {
      throw new ValidationDomainError(`Cannot apply a discount once the order is ${order.status}`);
    }
    if (order.discounts.length > 0) {
      throw new ValidationDomainError(
        'This order already has a discount applied — remove it before applying another.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const base = new Decimal(order.subtotal.toString());
      const amount = computeDiscountAmount(dto.type, new Decimal(dto.value), base);
      await tx.discountApplication.create({
        data: {
          orderId,
          type: dto.type,
          value: dto.value.toString(),
          amount: amount.toString(),
          reason: dto.reason,
          appliedByUserId: actorUserId,
        },
      });
      await this.recalcTotals(tx, organizationId, outletId, orderId);
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'order.discount_applied',
      entityType: 'Order',
      entityId: orderId,
      newState: dto,
    });

    this.realtime.orderUpdated(outletId, orderId, order.diningSessionId);

    return this.getById(organizationId, outletId, orderId);
  }

  // ---------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------

  async acceptOrder(
    organizationId: string,
    outletId: string,
    orderId: string,
    actorUserId: string,
  ) {
    return this.transitionStatus(
      organizationId,
      outletId,
      orderId,
      'ACCEPTED',
      actorUserId,
      'STAFF',
    );
  }

  async markServed(organizationId: string, outletId: string, orderId: string, actorUserId: string) {
    return this.transitionStatus(organizationId, outletId, orderId, 'SERVED', actorUserId, 'STAFF');
  }

  async cancelOrder(
    organizationId: string,
    outletId: string,
    orderId: string,
    reason: string | undefined,
    actorUserId: string,
  ) {
    const result = await this.transitionStatus(
      organizationId,
      outletId,
      orderId,
      'CANCELLED',
      actorUserId,
      'STAFF',
      reason,
    );
    await this.prisma.kitchenOrderItem.updateMany({
      where: { orderItem: { orderId } },
      data: { status: 'CANCELLED' },
    });
    return result;
  }

  /**
   * Used only by KitchenService to reflect PREPARING/READY once kitchen item statuses move —
   * there is no client-callable "set order to PREPARING" endpoint, because that transition
   * is *derived* from kitchen activity, never staff-declared directly. See KitchenService.
   */
  async setStatusFromSystem(
    organizationId: string,
    outletId: string,
    orderId: string,
    toStatus: OrderStatus,
  ) {
    return this.transitionStatus(organizationId, outletId, orderId, toStatus, undefined, 'SYSTEM');
  }

  /** Used only by BillingService/PaymentsService to reflect BILLED/PAID/COMPLETED/REFUNDED. */
  async setStatusFromDomain(
    organizationId: string,
    outletId: string,
    orderId: string,
    toStatus: OrderStatus,
    actorUserId?: string,
  ) {
    return this.transitionStatus(organizationId, outletId, orderId, toStatus, actorUserId, 'STAFF');
  }

  private async transitionStatus(
    organizationId: string,
    outletId: string,
    orderId: string,
    toStatus: OrderStatus,
    actorUserId: string | undefined,
    actorType: OrderActorType,
    reason?: string,
  ) {
    const order = await this.getById(organizationId, outletId, orderId);
    assertOrderTransition(order.status as OrderStatus, toStatus);

    await this.prisma.$transaction(async (tx) => {
      const extra: Record<string, unknown> = {};
      if (toStatus === 'CANCELLED') {
        extra.cancelledAt = new Date();
        extra.cancelReason = reason;
      }
      await tx.order.updateMany({
        where: { id: orderId, outletId },
        data: { status: toStatus, ...extra },
      });
      await tx.orderEvent.create({
        data: { orderId, actorUserId, actorType, fromStatus: order.status, toStatus, reason },
      });
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: `order.status_${toStatus.toLowerCase()}`,
      entityType: 'Order',
      entityId: orderId,
      previousState: { status: order.status },
      newState: { status: toStatus },
    });

    this.realtime.orderUpdated(outletId, orderId, order.diningSessionId);
    if (toStatus === 'CANCELLED') this.realtime.kitchenQueueUpdated(outletId);

    // `transitionStatus` is the single choke point every order status change passes through
    // (SYSTEM-driven from KitchenService.recomputeOrderStatus, STAFF-driven from
    // BillingService/PaymentsService) — the one place to hook "notify someone" without
    // duplicating this logic per caller. Fire-and-forget: NotificationsService.create never
    // throws into its caller, and a failed notification must never fail the order transition
    // that already committed above it.
    if (toStatus === 'READY') {
      const label =
        order.type === 'DINE_IN'
          ? `${order.table?.name ?? 'A table'}'s order (#${order.orderNumber})`
          : `Takeaway order #${order.orderNumber}`;
      void this.notificationsService.notifyOrderReady(organizationId, outletId, orderId, label);
    }

    return this.getById(organizationId, outletId, orderId);
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async getById(organizationId: string, outletId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { organizationId, outletId, id },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundDomainError('Order', id);
    return order;
  }

  /**
   * The POS/waiter "active orders" board — everything not yet fully settled or voided.
   * Deliberately its own inline status list rather than ORDER_FINANCIALLY_SETTLED_STATUSES:
   * that constant treats PAID as settled (correctly, for "can this order still be discounted"),
   * but a PAID order still belongs on the active board until it's COMPLETED — staff still need
   * to see it. See order-state-machine.ts for the full contrast between the status checks that
   * look alike across this file.
   */
  async listActiveForOutlet(organizationId: string, outletId: string) {
    return this.prisma.order.findMany({
      where: {
        organizationId,
        outletId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUNDED'] },
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * The other half of `listActiveForOutlet`: once an order settles to `COMPLETED` it drops off
   * the active board (by design — staff shouldn't have to scroll past finished orders to find
   * live ones) and every list-driven route to `BillingDetailScreen`/`billing_detail_screen.dart`
   * goes with it. That used to leave completed orders permanently unreachable in the UI the
   * moment anyone navigated away — the order's `Print bill` button still worked, nothing there
   * broke, there was just no way back to it to press it (a cashier who paid, then hit "Back to
   * Billing" before printing, had no way to get back for a reprint). This is what closes that
   * gap: Billing in both apps now has a "Completed" tab alongside "Incomplete" (the old flat
   * list, unchanged), sourced from here, each row still linking to the same detail screen.
   *
   * `date` is a single calendar day — any `Date` whose *day* (in UTC; see `startOfDay`) is the
   * one to list, not a datetime range — matching the Completed tab's date-picker filter in both
   * apps. Deliberately one day at a time rather than an unbounded/all-time query: an unbounded
   * completed-orders list would only grow forever, and "every completed order ever" isn't what
   * either app's UI is offering (that's what `docs/reports.md`'s order history, once built, is
   * for) — this is a day-by-day lookup for reprinting a receipt or checking a specific day's
   * business, not a report.
   */
  async listCompletedForOutlet(organizationId: string, outletId: string, date: Date) {
    const from = startOfDay(date);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.order.findMany({
      where: {
        organizationId,
        outletId,
        status: 'COMPLETED',
        updatedAt: { gte: from, lt: to },
      },
      include: ORDER_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  /** Recomputes and persists Order's rollup totals from its current (non-cancelled) items + discounts. */
  async recalcTotals(
    tx: Prisma.TransactionClient,
    organizationId: string,
    outletId: string,
    orderId: string,
  ) {
    const [items, discounts, outlet] = await Promise.all([
      tx.orderItem.findMany({ where: { orderId, isCancelled: false } }),
      tx.discountApplication.findMany({ where: { orderId } }),
      tx.outlet.findFirst({ where: { id: outletId, organizationId } }),
    ]);
    if (!outlet) throw new NotFoundDomainError('Outlet', outletId);

    const totals = computeOrderTotals({
      itemSubtotals: items.map((i) => new Decimal(i.subtotal.toString())),
      itemTaxes: items.map((i) => new Decimal(i.taxAmount.toString())),
      discountTotal: discounts.reduce((sum, d) => sum.plus(d.amount.toString()), new Decimal(0)),
      serviceChargePercent: new Decimal(outlet.serviceChargePercent.toString()),
      roundOffEnabled: outlet.roundOffEnabled,
    });

    await tx.order.updateMany({
      where: { id: orderId, outletId },
      data: {
        subtotal: totals.subtotal.toString(),
        discountTotal: totals.discountTotal.toString(),
        taxTotal: totals.taxTotal.toString(),
        serviceChargeTotal: totals.serviceChargeTotal.toString(),
        roundOff: totals.roundOff.toString(),
        total: totals.total.toString(),
      },
    });
  }

  /** Validates + prices every requested line against the live menu — never trusts a client-supplied price. */
  private async priceItems(
    tx: Prisma.TransactionClient,
    outletId: string,
    inputs: CreateOrderItemDto[],
  ) {
    const prepared: {
      menuItemId: string;
      menuItemVariantId?: string;
      nameSnapshot: string;
      variantNameSnapshot?: string;
      unitPrice: Decimal;
      quantity: number;
      notes?: string;
      modifiers: {
        modifierId: string;
        nameSnapshot: string;
        priceDeltaSnapshot: Decimal;
        quantity: number;
      }[];
      priced: ReturnType<typeof priceOrderItem>;
    }[] = [];

    for (const input of inputs) {
      const menuItem = await tx.menuItem.findFirst({
        where: { id: input.menuItemId, category: { menu: { outletId } } },
        include: {
          variants: true,
          taxGroup: { include: { components: true } },
          modifierGroups: { include: { modifierGroup: { include: { modifiers: true } } } },
        },
      });
      if (!menuItem) throw new NotFoundDomainError('MenuItem', input.menuItemId);
      if (!menuItem.isActive || !menuItem.isAvailable) {
        throw new ValidationDomainError(`"${menuItem.name}" is not currently available`);
      }

      let unitPrice = new Decimal(menuItem.basePrice.toString());
      let variantNameSnapshot: string | undefined;
      if (input.menuItemVariantId) {
        const variant = menuItem.variants.find((v) => v.id === input.menuItemVariantId);
        if (!variant) throw new NotFoundDomainError('MenuItemVariant', input.menuItemVariantId);
        unitPrice = new Decimal(variant.priceOverride.toString());
        variantNameSnapshot = variant.name;
      }

      const availableModifiers = menuItem.modifierGroups.flatMap((g) => g.modifierGroup.modifiers);
      const modifiers = (input.modifiers ?? []).map((m) => {
        const modifier = availableModifiers.find((mod) => mod.id === m.modifierId);
        if (!modifier) {
          throw new ValidationDomainError(
            `Modifier ${m.modifierId} is not available for "${menuItem.name}"`,
          );
        }
        return {
          modifierId: modifier.id,
          nameSnapshot: modifier.name,
          priceDeltaSnapshot: new Decimal(modifier.priceDelta.toString()),
          quantity: m.quantity ?? 1,
        };
      });

      const taxComponents = (menuItem.taxGroup?.components ?? []).map((c) => ({
        taxType: c.taxType,
        ratePercent: new Decimal(c.ratePercent.toString()),
      }));

      const priced = priceOrderItem({
        unitPrice,
        quantity: input.quantity,
        modifiers,
        taxComponents,
      });

      prepared.push({
        menuItemId: menuItem.id,
        menuItemVariantId: input.menuItemVariantId,
        nameSnapshot: menuItem.name,
        variantNameSnapshot,
        unitPrice,
        quantity: input.quantity,
        notes: input.notes,
        modifiers,
        priced,
      });
    }

    return prepared;
  }

  private async persistOrderItems(
    tx: Prisma.TransactionClient,
    orderId: string,
    prepared: Awaited<ReturnType<OrdersService['priceItems']>>,
  ) {
    const createdItems: { id: string; quantity: number }[] = [];
    for (const p of prepared) {
      const item = await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: p.menuItemId,
          menuItemVariantId: p.menuItemVariantId,
          nameSnapshot: p.nameSnapshot,
          variantNameSnapshot: p.variantNameSnapshot,
          unitPrice: p.unitPrice.toString(),
          quantity: p.quantity,
          subtotal: p.priced.subtotal.toString(),
          taxAmount: p.priced.taxAmount.toString(),
          total: p.priced.total.toString(),
          notes: p.notes,
        },
      });
      if (p.modifiers.length) {
        await tx.orderItemModifier.createMany({
          data: p.modifiers.map((m) => ({
            orderItemId: item.id,
            modifierId: m.modifierId,
            nameSnapshot: m.nameSnapshot,
            priceDeltaSnapshot: m.priceDeltaSnapshot.toString(),
            quantity: m.quantity,
          })),
        });
      }
      createdItems.push({ id: item.id, quantity: p.quantity });
    }
    return createdItems;
  }

  /**
   * One KOT per "batch" of items (spec §8): the initial order placement, and each later
   * `addItems` call, each produce their own KitchenOrder so the kitchen can visually tell
   * "these 2 items were added after the table already started eating" (`isModification`).
   * v1 routes every KOT to a single, unrouted queue (`stationId: null`) — there is no
   * per-menu-item station mapping in the schema yet (Kitchen Stations exist as a
   * configurable entity for when that's added), so multi-station routing is a known,
   * documented v1 gap rather than a bug. See docs/architecture.md §8.
   */
  private async createKitchenOrder(
    tx: Prisma.TransactionClient,
    organizationId: string,
    outletId: string,
    orderId: string,
    items: { id: string; quantity: number }[],
    isModification: boolean,
  ) {
    if (items.length === 0) return;
    const kotNumber = await this.dailyCounter.next(tx, outletId, 'KOT');
    const kitchenOrder = await tx.kitchenOrder.create({
      data: { organizationId, outletId, orderId, kotNumber, isModification },
    });
    await tx.kitchenOrderItem.createMany({
      data: items.map((i) => ({
        kitchenOrderId: kitchenOrder.id,
        orderItemId: i.id,
        quantity: i.quantity,
      })),
    });
    return kitchenOrder;
  }
}
