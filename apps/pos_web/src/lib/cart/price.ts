import Decimal from 'decimal.js';
import type { PosCartLine } from './pos-cart-types';

/** Client-side estimate only — the server (`OrdersService`'s `order-pricing.util.ts`)
 * recomputes every price from the current menu/tax data at order-placement time, which is the
 * only number ever authoritative. This just keeps the cart panel from looking broken while
 * empty of totals — same tradeoff as `apps/customer_web/src/lib/cart/price-estimate.ts`. */
export function lineTotal(line: PosCartLine): Decimal {
  const modifiersTotal = line.modifierSummaries.reduce(
    (sum, m) => sum.plus(m.priceDelta),
    new Decimal(0),
  );
  return new Decimal(line.unitPrice).plus(modifiersTotal).times(line.quantity);
}

export function cartSubtotal(lines: PosCartLine[]): Decimal {
  return lines.reduce((sum, line) => sum.plus(lineTotal(line)), new Decimal(0));
}

export function formatMoney(value: Decimal | string | number): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  return `₹${decimal.toDecimalPlaces(2).toFixed(2)}`;
}
