import Decimal from 'decimal.js';

/**
 * Every money computation in the order domain funnels through this file — see spec §31
 * "decimal-safe, GST-aware billing; never floating point". `decimal.js` is used instead of
 * JS `number` for every intermediate step, and values are only rounded to 2dp at the point
 * they're persisted, never mid-calculation, so rounding error can't compound across items.
 */

export interface PricedModifierInput {
  modifierId: string;
  nameSnapshot: string;
  priceDeltaSnapshot: Decimal;
  quantity: number;
}

export interface TaxComponentInput {
  taxType: string;
  ratePercent: Decimal;
}

export interface PricedItemInput {
  unitPrice: Decimal;
  quantity: number;
  modifiers: PricedModifierInput[];
  taxComponents: TaxComponentInput[];
}

export interface PricedItem {
  subtotal: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  perTax: { taxType: string; ratePercent: Decimal; taxableAmount: Decimal; taxAmount: Decimal }[];
}

/**
 * Prices a single order line: `(unitPrice + Σ modifier price deltas) × quantity`, then GST
 * components applied to that line's subtotal (v1 has no per-item discount — see
 * OrdersService — so the taxable base is always the full line subtotal).
 */
export function priceOrderItem(input: PricedItemInput): PricedItem {
  const modifiersUnit = input.modifiers.reduce(
    (sum, m) => sum.plus(m.priceDeltaSnapshot.times(m.quantity)),
    new Decimal(0),
  );
  const subtotal = input.unitPrice.plus(modifiersUnit).times(input.quantity);

  const perTax = input.taxComponents.map((c) => ({
    taxType: c.taxType,
    ratePercent: c.ratePercent,
    taxableAmount: subtotal.toDecimalPlaces(2),
    taxAmount: subtotal.times(c.ratePercent).dividedBy(100).toDecimalPlaces(2),
  }));
  const taxAmount = perTax.reduce((sum, t) => sum.plus(t.taxAmount), new Decimal(0));

  return {
    subtotal: subtotal.toDecimalPlaces(2),
    taxAmount: taxAmount.toDecimalPlaces(2),
    total: subtotal.plus(taxAmount).toDecimalPlaces(2),
    perTax,
  };
}

export interface OrderTotalsInput {
  itemSubtotals: Decimal[];
  itemTaxes: Decimal[];
  discountTotal: Decimal;
  serviceChargePercent: Decimal;
  roundOffEnabled: boolean;
}

export interface OrderTotals {
  subtotal: Decimal;
  taxTotal: Decimal;
  discountTotal: Decimal;
  serviceChargeTotal: Decimal;
  roundOff: Decimal;
  total: Decimal;
}

/**
 * Rolls up an order's (non-cancelled) items into the totals stored on `Order`. Service
 * charge is computed on (subtotal - discount), matching how GST-registered Indian
 * restaurants typically apply it (spec §16) — never on the pre-discount amount. Round-off,
 * when the outlet has it enabled, rounds the final total to the nearest whole rupee and
 * records the delta separately (`roundOff`) rather than silently absorbing it, so an invoice
 * can show "Round off: -₹0.40" as its own line per Indian retail convention.
 */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = input.itemSubtotals.reduce((sum, s) => sum.plus(s), new Decimal(0));
  const taxTotal = input.itemTaxes.reduce((sum, t) => sum.plus(t), new Decimal(0));
  const discountTotal = Decimal.min(input.discountTotal, subtotal);

  const taxableBase = subtotal.minus(discountTotal);
  const serviceChargeTotal = taxableBase
    .times(input.serviceChargePercent)
    .dividedBy(100)
    .toDecimalPlaces(2);

  const preRound = subtotal.minus(discountTotal).plus(taxTotal).plus(serviceChargeTotal);
  const total = input.roundOffEnabled
    ? preRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    : preRound.toDecimalPlaces(2);
  const roundOff = total.minus(preRound).toDecimalPlaces(2);

  return {
    subtotal: subtotal.toDecimalPlaces(2),
    taxTotal: taxTotal.toDecimalPlaces(2),
    discountTotal: discountTotal.toDecimalPlaces(2),
    serviceChargeTotal,
    roundOff,
    total,
  };
}

export function computeDiscountAmount(
  type: 'PERCENTAGE' | 'FIXED',
  value: Decimal,
  base: Decimal,
): Decimal {
  const amount = type === 'PERCENTAGE' ? base.times(value).dividedBy(100) : value;
  return Decimal.min(amount, base).toDecimalPlaces(2);
}
