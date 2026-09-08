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

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  type: 'DINE_IN' | 'TAKEAWAY';
  diningSessionId: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  serviceChargeTotal: string;
  roundOff: string;
  total: string;
  notes: string | null;
  items: OrderItemSummary[];
  createdAt: string;
  updatedAt: string;
}
