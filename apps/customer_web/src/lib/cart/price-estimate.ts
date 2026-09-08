import Decimal from 'decimal.js';
import type { CartLine } from './cart-types';

/**
 * Client-side price estimate only — shown so a diner knows roughly what they're about to
 * order, never sent to or trusted by the server. `services/api`'s OrdersService recomputes
 * every price from the current menu/tax data at order-placement time
 * (order-pricing.util.ts on the backend), which is the only number that's ever authoritative;
 * this exists purely so the cart screen doesn't look broken while empty of totals. Excludes
 * tax/service-charge/discount, which the backend applies — this is an item-subtotal estimate,
 * labeled as such in the UI (see CartScreen).
 */
export function lineTotal(line: CartLine): Decimal {
  const modifiersTotal = line.modifierSummaries.reduce(
    (sum, m) => sum.plus(m.priceDelta),
    new Decimal(0),
  );
  return new Decimal(line.unitPrice).plus(modifiersTotal).times(line.quantity);
}

export function cartSubtotal(lines: CartLine[]): Decimal {
  return lines.reduce((sum, line) => sum.plus(lineTotal(line)), new Decimal(0));
}

export function formatMoney(value: Decimal | string | number): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  return `₹${decimal.toDecimalPlaces(2).toFixed(2)}`;
}
