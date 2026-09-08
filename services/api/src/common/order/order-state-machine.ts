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

/**
 * Order statuses that represent a final, financially-settled state — no further order-level
 * money mutation (adjusting a discount, closing the table it belongs to) should happen from
 * here. Deliberately excludes BILLED: a billed order has a bill generated but no money has
 * actually moved yet, so for these purposes it's still "open" — e.g. a discount can still be
 * corrected before the guest actually pays, and a table can't be closed while an order sits at
 * BILLED unpaid (that's exactly the case DiningSessionsService.close needs to block on).
 *
 * This is narrower than "terminal" in the TRANSITIONS table above (CANCELLED/REFUNDED have no
 * further transitions either, but so would a hypothetical future non-financial terminal state)
 * — it's specifically the "the money side of this order is done" concept, currently shared by
 * OrdersService.applyDiscount and DiningSessionsService.close, which is why it's centralized
 * here rather than left as two independently hand-typed array literals that could silently
 * drift apart.
 *
 * A few other status checks elsewhere look similar at a glance but are answering genuinely
 * different questions, and are deliberately NOT expressed with this constant:
 *   - OrdersService.cancelItem also locks at BILLED (once a bill exists, line items are frozen
 *     even before payment, since the bill already reflects them)
 *   - OrdersService.listActiveForOutlet's "still on the active board" set excludes only
 *     COMPLETED/CANCELLED/REFUNDED (BILLED and PAID orders are still "active" — they still need
 *     completing)
 *   - PaymentsService.recordPayment uses an allow-list (BILLED/PAID only) — the inverse shape
 *     of a settled check, and a different rule (which orders may currently take a payment)
 * Do not reuse this constant for those; add a differently-named one if a genuine duplicate of
 * one of *those* rules shows up instead.
 */
export const ORDER_FINANCIALLY_SETTLED_STATUSES: readonly OrderStatus[] = [
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
];

export function isOrderFinanciallySettled(status: OrderStatus): boolean {
  return ORDER_FINANCIALLY_SETTLED_STATUSES.includes(status);
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
