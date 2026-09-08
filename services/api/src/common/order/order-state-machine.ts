import { InvalidOrderTransitionError } from '../errors/domain-errors';

/**
 * Mirrors the `OrderStatus` enum in prisma/schema.prisma. Kept as a local literal union
 * (not imported from `@prisma/client`) so this file — and everything that only needs the
 * *shape* of the state machine, like tests — has zero dependency on the generated client.
 * See docs/architecture.md §5 for the full diagram this table encodes.
 */
export type OrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'BILLED'
  | 'PAID'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

/**
 * The single source of truth for which order-status transitions are legal. Every status
 * write in the order domain — OrdersService, KitchenService's derived transitions,
 * BillingService, PaymentsService — must go through `assertOrderTransition` rather than
 * writing `status` directly, so an illegal jump (e.g. PLACED straight to PAID, skipping
 * billing) fails loudly instead of silently corrupting the order's history.
 *
 * CANCELLED is reachable from every pre-payment state (a guest changes their mind, or staff
 * voids a mis-entered order) but never after PAID/COMPLETED — a paid order can only be
 * REFUNDED, never retroactively cancelled, because money has already changed hands.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  // READY -> PREPARING is the one backward edge: a waiter adding items to a table whose
  // previous round is already fully plated reopens the ticket, since there's now unprepared
  // work again (see OrdersService.addItems / KitchenService.recomputeOrderStatus).
  READY: ['SERVED', 'PREPARING', 'CANCELLED'],
  SERVED: ['BILLED', 'CANCELLED'],
  BILLED: ['PAID', 'CANCELLED'],
  PAID: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

/** Mirrors `KitchenItemStatus` in the schema — see KitchenService for how it drives Order.status. */
export type KitchenItemStatus = 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

const KITCHEN_ITEM_TRANSITIONS: Record<KitchenItemStatus, KitchenItemStatus[]> = {
  NEW: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertKitchenItemTransition(from: KitchenItemStatus, to: KitchenItemStatus): void {
  if (!KITCHEN_ITEM_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
