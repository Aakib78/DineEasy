/** Mirrors `BillingController`/`BillingService`'s `Invoice` response shape
 * (`services/api/src/modules/billing`) — same shape `apps/restaurant_app/lib/features/billing/data/billing_models.dart`
 * hand-mirrors on the Dart side (no shared codegen pipeline for Dart yet, see this package's
 * own index.ts doc comment). */

export interface InvoiceItemLine {
  description: string;
  quantity: number;
  total: string;
}

/** One GST component line (CGST/SGST/IGST) or the service-charge line, exactly as
 * `BillingService.generateInvoice` computes them on the backend. */
export interface InvoiceTaxLine {
  taxType: string;
  ratePercent: string;
  taxAmount: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  serviceChargeTotal: string;
  total: string;
  items: InvoiceItemLine[];
  taxes: InvoiceTaxLine[];
}
