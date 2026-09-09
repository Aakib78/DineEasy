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

/** Only `SUCCEEDED` counts toward "how much of this order has been paid" — see
 * `PaymentsService.sumSucceeded` on the backend (mirrored client-side wherever a "remaining
 * balance" is shown, e.g. the POS billing screens). */
export interface PaymentSummary {
  id: string;
  method: PaymentMethod;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amount: string;
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
   * optional here since the QR guest order-status read doesn't need it. */
  payments?: PaymentSummary[];
  createdAt: string;
  updatedAt: string;
}
