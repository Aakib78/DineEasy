/** Mirrors the unified `Order` domain (spec §7/§31) as returned by both `OrdersController`
 * (POS/Waiter) and `OrdersGuestController` (QR) — `services/api/src/modules/orders/`. One
 * `Order` model, one state machine, regardless of which controller created or is reading it. */

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

export interface OrderItemModifierSummary {
  id: string;
  modifierId: string;
  nameSnapshot: string;
  priceDeltaSnapshot: string;
  quantity: number;
}

export interface OrderItemSummary {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  variantNameSnapshot: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  isCancelled: boolean;
  notes: string | null;
  modifiers: OrderItemModifierSummary[];
}

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'OTHER';

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type RefundStatus = 'PENDING' | 'APPROVED' | 'PROCESSED' | 'REJECTED';

/** A refund only ever moves `PENDING` -> `PROCESSED` in v1 — `initiateRefund` creates it,
 * `approveRefund` (same `payments.refund` permission, no separate approver role) immediately
 * processes it. `APPROVED`/`REJECTED` are reserved schema values no endpoint sets yet — see
 * `PaymentsService.approveRefund`'s doc comment on the backend. Refunds never mutate
 * `Payment.amount`; a payment's refundable balance is always `amount - sum(refunds where
 * status === 'PROCESSED')`, computed client-side. */
export interface Refund {
  id: string;
  paymentId: string;
  amount: string;
  reason: string | null;
  status: RefundStatus;
  initiatedByUserId: string;
  approvedByUserId: string | null;
  createdAt: string;
}

/** Only `SUCCEEDED` counts toward "how much of this order has been paid" — see
 * `PaymentsService.sumSucceeded` on the backend (mirrored client-side wherever a "remaining
 * balance" is shown, e.g. the POS billing screens). `refunds` is only populated by
 * `GET /orders/:orderId/payments` (`paymentsApi.list`) — the `payments` embedded on
 * `GET /orders/:id` does NOT include it (`ORDER_INCLUDE.payments` on the backend has no nested
 * `refunds` include), so it's optional here and callers building refund UI must fetch the
 * dedicated endpoint rather than trusting `order.payments[].refunds`. */
export interface PaymentSummary {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  refunds?: Refund[];
}

export type DiscountType = 'PERCENTAGE' | 'FIXED';

/** One row per discount applied to an order — v1 allows at most one per order (see
 * `OrdersService.applyDiscount`'s doc comment; there's no "remove/replace discount" endpoint,
 * so once applied a discount is permanent for that order). `value` is the raw number staff
 * entered (a percent or a rupee amount depending on `type`); `amount` is the computed rupee
 * amount actually applied (already reflected in `Order.discountTotal`). */
export interface DiscountApplication {
  id: string;
  orderId: string;
  type: DiscountType;
  value: string;
  amount: string;
  reason: string | null;
  appliedByUserId: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: 'DINE_IN' | 'TAKEAWAY';
  diningSessionId: string | null;
  /** Present for DINE_IN orders, null for TAKEAWAY — see `CreateOrderDto.tableId`. */
  tableId?: string | null;
  /** `ORDER_INCLUDE.table` on the backend (`orders.service.ts`) always joins the full table
   * row for staff-facing reads (POS/Billing) — the QR guest side never surfaces this field, so
   * it's optional here rather than required. */
  table?: { id: string; name: string } | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  serviceChargeTotal: string;
  roundOff: string;
  total: string;
  notes: string | null;
  items: OrderItemSummary[];
  /** `ORDER_INCLUDE.payments` — present on `GET /orders` and `GET /orders/:id` (staff routes),
   * optional here since the QR guest order-status read doesn't need it. Note: these
   * `PaymentSummary` entries do NOT carry `refunds` (see that interface's doc comment) — fetch
   * `paymentsApi.list(orderId)` for that. */
  payments?: PaymentSummary[];
  /** `ORDER_INCLUDE.discounts` — present on `GET /orders` and `GET /orders/:id` (staff routes).
   * Aggregate total is always `discountTotal` above; this is the (at most one, in v1) underlying
   * `DiscountApplication` row, for showing who applied it, what type/value, and why. */
  discounts?: DiscountApplication[];
  createdAt: string;
  updatedAt: string;
}
