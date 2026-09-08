/// Data models for the three read-only, `reports.view`-gated report endpoints
/// (`services/api/src/modules/reports/reports.controller.ts`). All three share a date range
/// resolved server-side by `ReportsService.resolveRange`: a missing `to` defaults to "now" and
/// a missing `from` defaults to the start of `to`'s day — this app never has to reimplement
/// that default, it just omits `from`/`to` from the request when the user hasn't picked one.
library;

/// `GET /reports/sales-summary`. Computed only over orders with status PAID or COMPLETED within
/// the range (`SETTLED_STATUSES` on the backend) — an order that's still open, or was voided
/// before ever being paid, never contributes here.
class SalesSummary {
  const SalesSummary({
    required this.from,
    required this.to,
    required this.orderCount,
    required this.dineInCount,
    required this.takeawayCount,
    required this.subtotal,
    required this.discountTotal,
    required this.taxTotal,
    required this.serviceChargeTotal,
    required this.revenue,
    required this.averageOrderValue,
  });

  factory SalesSummary.fromJson(Map<String, dynamic> json) {
    return SalesSummary(
      from: DateTime.parse(json['from'] as String),
      to: DateTime.parse(json['to'] as String),
      orderCount: json['orderCount'] as int,
      dineInCount: json['dineInCount'] as int,
      takeawayCount: json['takeawayCount'] as int,
      subtotal: (json['subtotal'] ?? '0').toString(),
      discountTotal: (json['discountTotal'] ?? '0').toString(),
      taxTotal: (json['taxTotal'] ?? '0').toString(),
      serviceChargeTotal: (json['serviceChargeTotal'] ?? '0').toString(),
      revenue: (json['revenue'] ?? '0').toString(),
      averageOrderValue: (json['averageOrderValue'] ?? '0').toString(),
    );
  }

  final DateTime from;
  final DateTime to;
  final int orderCount;
  final int dineInCount;
  final int takeawayCount;

  // All money fields arrive as decimal strings — see Money's class doc comment on why this app
  // never round-trips them through double.
  final String subtotal;
  final String discountTotal;
  final String taxTotal;
  final String serviceChargeTotal;
  final String revenue;
  final String averageOrderValue;
}

/// One row of `GET /reports/top-items` — the backend orders these by `quantitySold` descending
/// and caps the list at a server-side default (currently 10, not exposed as a query param), so
/// this app renders whatever list comes back rather than re-sorting or re-limiting it.
class TopItem {
  const TopItem({
    required this.menuItemId,
    required this.name,
    required this.quantitySold,
    required this.revenue,
  });

  factory TopItem.fromJson(Map<String, dynamic> json) {
    return TopItem(
      menuItemId: json['menuItemId'] as String,
      name: json['name'] as String,
      quantitySold: json['quantitySold'] as int,
      revenue: (json['revenue'] ?? '0').toString(),
    );
  }

  final String menuItemId;
  final String name;
  final int quantitySold;
  final String revenue;
}

/// One row of `GET /reports/payment-breakdown` — one entry per payment method actually used in
/// the range (a method with zero SUCCEEDED payments simply doesn't appear; this is not a fixed
/// four-row list to pad out on the client).
class PaymentBreakdownLine {
  const PaymentBreakdownLine({
    required this.method,
    required this.count,
    required this.amount,
  });

  factory PaymentBreakdownLine.fromJson(Map<String, dynamic> json) {
    return PaymentBreakdownLine(
      method: json['method'] as String,
      count: json['count'] as int,
      amount: (json['amount'] ?? '0').toString(),
    );
  }

  /// Raw string from the backend ('CASH' | 'UPI' | 'CARD' | 'OTHER') rather than the shared
  /// `PaymentMethod` enum from `pos_models.dart` — kept as a plain label here since this screen
  /// only ever displays it, never sends it back in a request that would need the enum's
  /// `paymentMethodToJson` round-trip.
  final String method;
  final int count;
  final String amount;
}
