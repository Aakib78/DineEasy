import Decimal from 'decimal.js';

/**
 * Pure logic extracted out of `BillingService.generateInvoice` specifically so it's testable
 * without a Prisma client — same reasoning as `orders/order-pricing.util.ts` and
 * `reports/reports.service.ts`'s `resolveRange`/`startOfDay` (see those files' doc comments,
 * and `docs/troubleshooting.md` for why this sandbox can't run anything needing
 * `@prisma/client`'s generated types). Fetching each billed item's `MenuItem.taxGroup.components`
 * still has to happen against a live database and stays in the service; only the decimal
 * aggregation math below — the part that was previously untestable here and, being GST money
 * math, is exactly the kind of thing worth actually running against cases, not just reading —
 * is pulled out.
 */

export interface InvoiceTaxComponentInput {
  taxType: string;
  /** Decimal string, e.g. "9.00" for a 9% CGST component. */
  ratePercent: string;
}

export interface InvoiceTaxableLine {
  /** The billed line's subtotal (already excludes cancelled items) as a decimal string. */
  subtotal: string;
  /** This line's `MenuItem.taxGroup.components` at billing time — empty if untaxed. */
  taxComponents: InvoiceTaxComponentInput[];
}

export interface InvoiceTaxBreakdownLine {
  taxType: string;
  ratePercent: string;
  taxableAmount: string;
  taxAmount: string;
}

/**
 * Aggregates every billed line's per-component tax into one row per `taxType` (e.g. CGST, SGST,
 * IGST) — the shape `InvoiceTax.createMany` writes. Each component's tax amount is
 * `subtotal * ratePercent / 100`, rounded to 2 decimal places *before* being added into the
 * running total for that type (matching what the original inline implementation always did —
 * rounding per component, not once at the end — since that's what the printed per-line receipt
 * amounts have to add up to; the two roundings can differ by a paisa on some inputs).
 *
 * Known limitation, preserved intentionally rather than silently "fixed" here: if two lines
 * carry the same `taxType` at *different* rates (e.g. a tax group was edited between order and
 * billing — see `BillingService`'s class doc comment), the emitted `ratePercent` for that row is
 * whichever rate was encountered first; only the amounts keep accumulating correctly across all
 * of them. A genuinely mixed-rate `taxType` within one invoice is rare enough in practice (rates
 * essentially never change mid-service) that this is documented rather than modeled as a rate
 * range — see the test for this exact case below.
 */
export function computeInvoiceTaxBreakdown(lines: InvoiceTaxableLine[]): InvoiceTaxBreakdownLine[] {
  const byType = new Map<
    string,
    { ratePercent: Decimal; taxableAmount: Decimal; taxAmount: Decimal }
  >();

  for (const line of lines) {
    const subtotal = new Decimal(line.subtotal);
    for (const component of line.taxComponents) {
      const ratePercent = new Decimal(component.ratePercent);
      const taxAmount = subtotal.times(ratePercent).dividedBy(100).toDecimalPlaces(2);
      const bucket = byType.get(component.taxType) ?? {
        ratePercent,
        taxableAmount: new Decimal(0),
        taxAmount: new Decimal(0),
      };
      bucket.taxableAmount = bucket.taxableAmount.plus(subtotal);
      bucket.taxAmount = bucket.taxAmount.plus(taxAmount);
      byType.set(component.taxType, bucket);
    }
  }

  return Array.from(byType.entries()).map(([taxType, v]) => ({
    taxType,
    ratePercent: v.ratePercent.toString(),
    taxableAmount: v.taxableAmount.toDecimalPlaces(2).toString(),
    taxAmount: v.taxAmount.toDecimalPlaces(2).toString(),
  }));
}
