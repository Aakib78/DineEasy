import { computeInvoiceTaxBreakdown } from './invoice-tax.util';

describe('computeInvoiceTaxBreakdown', () => {
  it('returns nothing for a line with no tax components (e.g. an exempt item)', () => {
    const result = computeInvoiceTaxBreakdown([{ subtotal: '100.00', taxComponents: [] }]);
    expect(result).toEqual([]);
  });

  it('computes a single CGST+SGST split on one line (the common India dine-in case)', () => {
    const result = computeInvoiceTaxBreakdown([
      {
        subtotal: '200.00',
        taxComponents: [
          { taxType: 'CGST', ratePercent: '9' },
          { taxType: 'SGST', ratePercent: '9' },
        ],
      },
    ]);
    expect(result).toContainEqual({
      taxType: 'CGST',
      ratePercent: '9',
      taxableAmount: '200',
      taxAmount: '18',
    });
    expect(result).toContainEqual({
      taxType: 'SGST',
      ratePercent: '9',
      taxableAmount: '200',
      taxAmount: '18',
    });
  });

  it('aggregates the same taxType across multiple lines rather than emitting one row per line', () => {
    const result = computeInvoiceTaxBreakdown([
      { subtotal: '100.00', taxComponents: [{ taxType: 'CGST', ratePercent: '9' }] },
      { subtotal: '50.00', taxComponents: [{ taxType: 'CGST', ratePercent: '9' }] },
    ]);
    expect(result).toEqual([
      { taxType: 'CGST', ratePercent: '9', taxableAmount: '150', taxAmount: '13.5' },
    ]);
  });

  it('rounds each component to 2 decimal places before accumulating, matching per-line receipt amounts', () => {
    // 33.33 * 9 / 100 = 2.9997 -> rounds to 3.00 per line; two such lines sum to 6.00,
    // not round(2 * 2.9997) = 6.00 either way here, but the distinction matters when the
    // per-line roundings don't all fall the same way (see the next test).
    const result = computeInvoiceTaxBreakdown([
      { subtotal: '33.33', taxComponents: [{ taxType: 'CGST', ratePercent: '9' }] },
    ]);
    expect(result).toEqual([
      { taxType: 'CGST', ratePercent: '9', taxableAmount: '33.33', taxAmount: '3' },
    ]);
  });

  it('sums already-rounded per-line tax amounts rather than rounding once at the end', () => {
    // Two lines whose raw (unrounded) tax is 1.005 each: rounded individually to 1.01 each
    // (decimal.js's default ROUND_HALF_UP), summing to 2.02 — not round(2 * 1.005) = 2.01.
    const result = computeInvoiceTaxBreakdown([
      { subtotal: '11.1667', taxComponents: [{ taxType: 'CGST', ratePercent: '9' }] },
      { subtotal: '11.1667', taxComponents: [{ taxType: 'CGST', ratePercent: '9' }] },
    ]);
    expect(result).toEqual([
      { taxType: 'CGST', ratePercent: '9', taxableAmount: '22.33', taxAmount: '2.02' },
    ]);
  });

  it('keeps the first-seen rate for a taxType when lines disagree (documented limitation)', () => {
    const result = computeInvoiceTaxBreakdown([
      { subtotal: '100.00', taxComponents: [{ taxType: 'CGST', ratePercent: '9' }] },
      { subtotal: '100.00', taxComponents: [{ taxType: 'CGST', ratePercent: '2.5' }] },
    ]);
    // ratePercent reported is the first line's rate (9), but both lines' amounts are summed:
    // 9.00 (from the first line) + 2.50 (from the second, at its own 2.5% rate) = 11.50.
    expect(result).toEqual([
      { taxType: 'CGST', ratePercent: '9', taxableAmount: '200', taxAmount: '11.5' },
    ]);
  });

  it('handles IGST (interstate) as just another taxType, independent of CGST/SGST', () => {
    const result = computeInvoiceTaxBreakdown([
      { subtotal: '500.00', taxComponents: [{ taxType: 'IGST', ratePercent: '18' }] },
    ]);
    expect(result).toEqual([
      { taxType: 'IGST', ratePercent: '18', taxableAmount: '500', taxAmount: '90' },
    ]);
  });

  it('returns [] for no lines at all (e.g. every item on the order was cancelled)', () => {
    expect(computeInvoiceTaxBreakdown([])).toEqual([]);
  });
});
