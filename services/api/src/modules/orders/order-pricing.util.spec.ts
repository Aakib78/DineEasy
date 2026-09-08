import Decimal from 'decimal.js';
import { computeDiscountAmount, computeOrderTotals, priceOrderItem } from './order-pricing.util';

describe('priceOrderItem', () => {
  it('prices a plain item with no modifiers or tax', () => {
    const result = priceOrderItem({
      unitPrice: new Decimal(150),
      quantity: 2,
      modifiers: [],
      taxComponents: [],
    });
    expect(result.subtotal.toString()).toBe('300');
    expect(result.taxAmount.toString()).toBe('0');
    expect(result.total.toString()).toBe('300');
  });

  it('applies modifier price deltas before multiplying by quantity', () => {
    // base 200 + 1x extra cheese (40) + 2x extra spicy (10 each, delta applies per modifier
    // quantity) = 260/unit, x3 quantity = 780
    const result = priceOrderItem({
      unitPrice: new Decimal(200),
      quantity: 3,
      modifiers: [
        {
          modifierId: 'm1',
          nameSnapshot: 'Extra Cheese',
          priceDeltaSnapshot: new Decimal(40),
          quantity: 1,
        },
        {
          modifierId: 'm2',
          nameSnapshot: 'Extra Spicy',
          priceDeltaSnapshot: new Decimal(10),
          quantity: 2,
        },
      ],
      taxComponents: [],
    });
    expect(result.subtotal.toString()).toBe('780');
  });

  it('splits GST into CGST/SGST components on the line subtotal (spec §16)', () => {
    // 100 x 2 = 200 subtotal; CGST 2.5% + SGST 2.5% = 5 each = 10 total tax, 210 total
    const result = priceOrderItem({
      unitPrice: new Decimal(100),
      quantity: 2,
      modifiers: [],
      taxComponents: [
        { taxType: 'CGST', ratePercent: new Decimal(2.5) },
        { taxType: 'SGST', ratePercent: new Decimal(2.5) },
      ],
    });
    expect(result.subtotal.toString()).toBe('200');
    expect(result.perTax).toHaveLength(2);
    expect(result.perTax[0].taxAmount.toString()).toBe('5');
    expect(result.perTax[1].taxAmount.toString()).toBe('5');
    expect(result.taxAmount.toString()).toBe('10');
    expect(result.total.toString()).toBe('210');
  });

  it('never uses floating point for a value that would lose precision as a JS number', () => {
    // 33.33 x 3 = 99.99 exactly, not 99.99000000000001 (classic float trap)
    const result = priceOrderItem({
      unitPrice: new Decimal('33.33'),
      quantity: 3,
      modifiers: [],
      taxComponents: [],
    });
    expect(result.subtotal.toString()).toBe('99.99');
  });
});

describe('computeOrderTotals', () => {
  const base = {
    itemSubtotals: [new Decimal(500)],
    itemTaxes: [new Decimal(25)], // 5% GST
    discountTotal: new Decimal(0),
    serviceChargePercent: new Decimal(0),
    roundOffEnabled: false,
  };

  it('rolls up subtotal/tax with no discount or service charge', () => {
    const totals = computeOrderTotals(base);
    expect(totals.subtotal.toString()).toBe('500');
    expect(totals.taxTotal.toString()).toBe('25');
    expect(totals.total.toString()).toBe('525');
  });

  it('applies service charge on (subtotal - discount), not on the pre-discount subtotal', () => {
    const totals = computeOrderTotals({
      ...base,
      discountTotal: new Decimal(100),
      serviceChargePercent: new Decimal(10),
    });
    // taxable base = 500 - 100 = 400; service charge = 10% of 400 = 40
    expect(totals.serviceChargeTotal.toString()).toBe('40');
    // total = 500 - 100 + 25 (tax, unaffected by discount in this util) + 40 = 465
    expect(totals.total.toString()).toBe('465');
  });

  it('never lets discountTotal exceed the subtotal', () => {
    const totals = computeOrderTotals({ ...base, discountTotal: new Decimal(10000) });
    expect(totals.discountTotal.toString()).toBe('500');
  });

  it('rounds the final total to the nearest rupee and records the delta separately when enabled', () => {
    const totals = computeOrderTotals({
      itemSubtotals: [new Decimal(100)],
      itemTaxes: [new Decimal(5.4)], // pre-round total = 105.40
      discountTotal: new Decimal(0),
      serviceChargePercent: new Decimal(0),
      roundOffEnabled: true,
    });
    expect(totals.total.toString()).toBe('105');
    expect(totals.roundOff.toString()).toBe('-0.4');
  });

  it('leaves the total at 2dp, un-rounded, when round-off is disabled', () => {
    const totals = computeOrderTotals({
      itemSubtotals: [new Decimal(100)],
      itemTaxes: [new Decimal(5.4)],
      discountTotal: new Decimal(0),
      serviceChargePercent: new Decimal(0),
      roundOffEnabled: false,
    });
    expect(totals.total.toString()).toBe('105.4');
    expect(totals.roundOff.toString()).toBe('0');
  });
});

describe('computeDiscountAmount', () => {
  it('computes a percentage discount off the base', () => {
    expect(computeDiscountAmount('PERCENTAGE', new Decimal(10), new Decimal(500)).toString()).toBe(
      '50',
    );
  });

  it('uses a fixed discount as-is, capped at the base', () => {
    expect(computeDiscountAmount('FIXED', new Decimal(75), new Decimal(500)).toString()).toBe('75');
  });

  it('never discounts more than the base amount', () => {
    expect(computeDiscountAmount('FIXED', new Decimal(9999), new Decimal(500)).toString()).toBe(
      '500',
    );
    expect(computeDiscountAmount('PERCENTAGE', new Decimal(150), new Decimal(500)).toString()).toBe(
      '500',
    );
  });
});
