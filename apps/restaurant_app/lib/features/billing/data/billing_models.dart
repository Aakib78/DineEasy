/// Mirrors `BillingController`/`BillingService`'s `Invoice` response shape
/// (services/api/src/modules/billing). Same hand-mirrored-model gap noted throughout
/// `lib/features/pos/data/pos_models.dart` — no shared codegen pipeline for Dart yet.
library;

class InvoiceItemLine {
  const InvoiceItemLine({required this.description, required this.quantity, required this.total});

  factory InvoiceItemLine.fromJson(Map<String, dynamic> json) => InvoiceItemLine(
    description: json['description'] as String,
    quantity: json['quantity'] as int? ?? 1,
    total: json['total'].toString(),
  );

  final String description;
  final int quantity;
  final String total;
}

/// One GST component line (CGST/SGST/IGST) or the service-charge line, exactly as
/// `BillingService.generateInvoice` computes them on the backend — see that method's doc
/// comment for why this is recomputed from the *current* tax group rather than one frozen at
/// order-placement time.
class InvoiceTaxLine {
  const InvoiceTaxLine({required this.taxType, required this.ratePercent, required this.taxAmount});

  factory InvoiceTaxLine.fromJson(Map<String, dynamic> json) => InvoiceTaxLine(
    taxType: json['taxType'] as String,
    ratePercent: json['ratePercent'].toString(),
    taxAmount: json['taxAmount'].toString(),
  );

  final String taxType;
  final String ratePercent;
  final String taxAmount;
}

class Invoice {
  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.subtotal,
    required this.discountTotal,
    required this.taxTotal,
    required this.serviceChargeTotal,
    required this.total,
    required this.items,
    required this.taxes,
  });

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
    id: json['id'] as String,
    invoiceNumber: json['invoiceNumber'] as String,
    subtotal: json['subtotal'].toString(),
    discountTotal: (json['discountTotal'] ?? 0).toString(),
    taxTotal: (json['taxTotal'] ?? 0).toString(),
    serviceChargeTotal: (json['serviceChargeTotal'] ?? 0).toString(),
    total: json['total'].toString(),
    items: (json['items'] as List<dynamic>? ?? const [])
        .map((i) => InvoiceItemLine.fromJson(i as Map<String, dynamic>))
        .toList(),
    taxes: (json['taxes'] as List<dynamic>? ?? const [])
        .map((t) => InvoiceTaxLine.fromJson(t as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String invoiceNumber;
  final String subtotal;
  final String discountTotal;
  final String taxTotal;
  final String serviceChargeTotal;
  final String total;
  final List<InvoiceItemLine> items;
  final List<InvoiceTaxLine> taxes;
}
