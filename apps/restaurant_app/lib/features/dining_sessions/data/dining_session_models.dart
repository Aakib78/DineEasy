import '../../pos/data/pos_models.dart' show Order;

/// Mirrors `DiningSession` (`services/api/prisma/schema.prisma`) as returned by
/// `GET /dining-sessions` and `GET /dining-sessions/:id` (`DiningSessionsController`). One
/// table's occupancy from first QR scan to staff closing it (see that controller's doc
/// comment) — v1 never creates one from either staff app, only `QrService` does, so this
/// model is read-only here; the one write path (`close`) already existed as the "Available"
/// status option in `TablesManagementScreen`'s edit sheet before this screen did, and stays
/// there rather than being duplicated.
///
/// [orders] reuses the same `Order` model `features/pos` already has rather than a second
/// parallel one — `DiningSessionsService.listOpenForOutlet` includes bare orders (`orders:
/// true`, no items/payments/discounts) while `getById` includes `items` too; `Order.fromJson`
/// already defaults every relation it doesn't find to an empty list, so the identical parser
/// works correctly against either shape.
class DiningSession {
  const DiningSession({
    required this.id,
    required this.tableId,
    required this.tableName,
    required this.status,
    required this.startedAt,
    required this.endedAt,
    required this.orders,
  });

  factory DiningSession.fromJson(Map<String, dynamic> json) {
    final table = json['table'] as Map<String, dynamic>?;
    return DiningSession(
      id: json['id'] as String,
      tableId: json['tableId'] as String,
      tableName: table?['name'] as String?,
      status: json['status'] as String? ?? 'OPEN',
      startedAt: DateTime.parse(json['startedAt'] as String),
      endedAt: json['endedAt'] != null ? DateTime.parse(json['endedAt'] as String) : null,
      orders: (json['orders'] as List<dynamic>? ?? const [])
          .map((o) => Order.fromJson(o as Map<String, dynamic>))
          .toList(),
    );
  }

  final String id;
  final String tableId;
  final String? tableName;

  /// 'OPEN' | 'CLOSED' — kept as the raw backend string rather than an enum since this model
  /// (unlike `Order`) only ever needs the two v1 values for direct display, never a switch
  /// over every possible transition.
  final String status;
  final DateTime startedAt;
  final DateTime? endedAt;
  final List<Order> orders;
}
