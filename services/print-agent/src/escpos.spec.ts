import { buildKotTicket, buildReceiptTicket, renderJobPayload, twoColumn } from './escpos';

describe('twoColumn', () => {
  it('pads so left and right land at opposite edges of the width', () => {
    const result = twoColumn('Paneer Tikka', 'x2', 20);
    expect(result.length).toBe(20);
    expect(result.startsWith('Paneer Tikka')).toBe(true);
    expect(result.endsWith('x2')).toBe(true);
  });

  it('always leaves at least one space between columns, even if it overflows width', () => {
    const result = twoColumn('A'.repeat(18), 'x99', 20);
    expect(result).toContain(' ');
    expect(result.endsWith('x99')).toBe(true);
  });

  it('truncates an overlong left column rather than the right (amounts must stay intact)', () => {
    const result = twoColumn('A very long item name that will not fit', 'Rs. 450.00', 20);
    expect(result.endsWith('Rs. 450.00')).toBe(true);
    expect(result.length).toBe(20);
  });
});

describe('buildKotTicket', () => {
  const basePayload = {
    kotNumber: 'K-001',
    orderNumber: 'ORD-100',
    tableName: 'T4',
    isModification: false,
    items: [
      { name: 'Butter Chicken', quantity: 2, notes: 'less spicy' },
      { name: 'Naan', quantity: 4, notes: null },
    ],
  };

  it('is a non-empty buffer starting with the ESC @ init sequence', () => {
    const ticket = buildKotTicket(basePayload, 42, new Date('2026-01-15T10:30:00'));
    expect(ticket.length).toBeGreaterThan(0);
    expect(ticket[0]).toBe(0x1b);
    expect(ticket[1]).toBe(0x40);
  });

  it('ends with a full-cut command (GS V 0)', () => {
    const ticket = buildKotTicket(basePayload, 42, new Date('2026-01-15T10:30:00'));
    const tail = ticket.subarray(ticket.length - 3);
    expect(Array.from(tail)).toEqual([0x1d, 0x56, 0x00]);
  });

  it('renders every item name, quantity, and note as ASCII text somewhere in the buffer', () => {
    const ticket = buildKotTicket(basePayload, 42, new Date('2026-01-15T10:30:00'));
    const text = ticket.toString('ascii');
    expect(text).toContain('Butter Chicken');
    expect(text).toContain('x2');
    expect(text).toContain('less spicy');
    expect(text).toContain('Naan');
    expect(text).toContain('x4');
    expect(text).toContain('K-001');
    expect(text).toContain('ORD-100');
    expect(text).toContain('T4');
  });

  it('labels a modification ticket distinctly from a fresh KOT', () => {
    const fresh = buildKotTicket(basePayload, 42, new Date()).toString('ascii');
    const modified = buildKotTicket(
      { ...basePayload, isModification: true },
      42,
      new Date(),
    ).toString('ascii');
    expect(fresh).toContain('KITCHEN ORDER TICKET');
    expect(modified).toContain('KOT - ADDED ITEMS');
  });

  it('falls back to "Takeaway / Delivery" when there is no table (matches a null tableId order)', () => {
    const text = buildKotTicket({ ...basePayload, tableName: null }, 42, new Date()).toString(
      'ascii',
    );
    expect(text).toContain('Takeaway / Delivery');
  });
});

describe('buildReceiptTicket', () => {
  const basePayload = {
    invoiceNumber: 'INV-2026-0001',
    orderNumber: 'ORD-100',
    items: [
      { description: 'Butter Chicken', quantity: 2, total: '598.00' },
      { description: 'Naan', quantity: 4, total: '160.00' },
    ],
    subtotal: '758.00',
    taxes: [
      { taxType: 'CGST', ratePercent: '2.5', taxAmount: '18.95' },
      { taxType: 'SGST', ratePercent: '2.5', taxAmount: '18.95' },
    ],
    total: '795.90',
  };

  it('renders every money figure as "Rs. <amount>", never a raw ₹ glyph', () => {
    const text = buildReceiptTicket(basePayload, 42, new Date()).toString('ascii');
    expect(text).toContain('Rs. 598.00');
    expect(text).toContain('Rs. 160.00');
    expect(text).toContain('Rs. 758.00');
    expect(text).toContain('Rs. 18.95');
    expect(text).toContain('Rs. 795.90');
    expect(text).not.toContain('₹');
  });

  it('renders every tax line with its type and rate', () => {
    const text = buildReceiptTicket(basePayload, 42, new Date()).toString('ascii');
    expect(text).toContain('CGST (2.5%)');
    expect(text).toContain('SGST (2.5%)');
  });

  it('ends with a full-cut command', () => {
    const ticket = buildReceiptTicket(basePayload, 42, new Date());
    const tail = ticket.subarray(ticket.length - 3);
    expect(Array.from(tail)).toEqual([0x1d, 0x56, 0x00]);
  });

  it('handles zero taxes without emitting a blank/broken tax section', () => {
    const text = buildReceiptTicket({ ...basePayload, taxes: [] }, 42, new Date()).toString(
      'ascii',
    );
    expect(text).toContain('Subtotal');
    expect(text).toContain('TOTAL');
  });
});

describe('renderJobPayload', () => {
  it('recognizes a KOT-shaped payload by its kotNumber field', () => {
    const { kind } = renderJobPayload({
      kotNumber: 'K-1',
      orderNumber: 'O-1',
      isModification: false,
      items: [],
    });
    expect(kind).toBe('KOT');
  });

  it('recognizes a receipt-shaped payload by its invoiceNumber field', () => {
    const { kind } = renderJobPayload({
      invoiceNumber: 'INV-1',
      orderNumber: 'O-1',
      items: [],
      subtotal: '0',
      taxes: [],
      total: '0',
    });
    expect(kind).toBe('RECEIPT');
  });

  it('throws a clear error for a payload matching neither shape, rather than printing garbage', () => {
    expect(() => renderJobPayload({ somethingElse: true })).toThrow(/matches neither/);
  });

  it('throws for a non-object payload', () => {
    expect(() => renderJobPayload(null)).toThrow(/not an object/);
    expect(() => renderJobPayload('a string')).toThrow(/not an object/);
  });

  it('tolerates a missing optional field (notes, tableName) without throwing', () => {
    expect(() =>
      renderJobPayload({
        kotNumber: 'K-1',
        orderNumber: 'O-1',
        isModification: false,
        items: [{ name: 'Naan', quantity: 1 }],
      }),
    ).not.toThrow();
  });
});
