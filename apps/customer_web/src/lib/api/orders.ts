import { apiRequest } from './client';
import type { Order } from './types';
import type { CartLine } from '../cart/cart-types';

export interface PlaceOrderInput {
  notes?: string;
  items: CartLine[];
}

function toOrderItemsPayload(items: CartLine[]) {
  return items.map((line) => ({
    menuItemId: line.menuItemId,
    menuItemVariantId: line.variantId,
    quantity: line.quantity,
    notes: line.notes,
    modifiers: line.modifierIds.map((modifierId) => ({ modifierId })),
  }));
}

/** POST /qr/orders — table/session/guestToken are never sent; the server derives them from
 *  the dining-session bearer token (see CreateGuestOrderDto's doc comment). */
export function placeOrder(sessionToken: string, input: PlaceOrderInput): Promise<Order> {
  return apiRequest<Order>('/qr/orders', {
    method: 'POST',
    sessionToken,
    body: { notes: input.notes, items: toOrderItemsPayload(input.items) },
  });
}

/** A guest can only ever fetch an order belonging to their own dining session — enforced
 *  server-side in OrdersGuestController.getById, not just by this client not asking for others. */
export function fetchOrder(sessionToken: string, orderId: string): Promise<Order> {
  return apiRequest<Order>(`/qr/orders/${encodeURIComponent(orderId)}`, { sessionToken });
}
