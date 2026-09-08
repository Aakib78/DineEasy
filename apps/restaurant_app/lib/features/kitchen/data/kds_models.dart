/// Mirrors `KitchenController`/`KitchenService`'s response shapes
/// (services/api/src/modules/kitchen). Same hand-mirrored-model gap noted throughout
/// `lib/features/pos/data/pos_models.dart` — no shared codegen pipeline for Dart yet.
library;

import '../../pos/data/pos_models.dart' show OrderItemModifierSummary;

class KitchenStation {
  const KitchenStation({required this.id, required this.name});

  factory KitchenStation.fromJson(Map<String, dynamic> json) =>
      KitchenStation(id: json['id'] as String, name: json['name'] as String);

  final String id;
  final String name;
}

enum KitchenItemStatus { newItem, preparing, ready, completed, cancelled }

KitchenItemStatus _kitchenItemStatusFromJson(String value) => switch (value) {
  'NEW' => KitchenItemStatus.newItem,
  'PREPARING' => KitchenItemStatus.preparing,
  'READY' => KitchenItemStatus.ready,
  'COMPLETED' => KitchenItemStatus.completed,
  'CANCELLED' => KitchenItemStatus.cancelled,
  _ => KitchenItemStatus.newItem,
};

/// For `PATCH /kitchen/items/:id/status` — see `UpdateKitchenItemStatusDto` on the backend
/// (`@IsIn(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'])` — NEW is never a valid *target*,
/// only ever the starting status a `KitchenOrderItem` is created with).
String kitchenItemStatusToJson(KitchenItemStatus status) => switch (status) {
  KitchenItemStatus.newItem =>
    throw ArgumentError('NEW is not a valid target status — see assertKitchenItemTransition.'),
  KitchenItemStatus.preparing => 'PREPARING',
  KitchenItemStatus.ready => 'READY',
  KitchenItemStatus.completed => 'COMPLETED',
  KitchenItemStatus.cancelled => 'CANCELLED',
};

class KdsTicketItem {
  const KdsTicketItem({
    required this.id,
    required this.quantity,
    required this.status,
    required this.nameSnapshot,
    required this.variantNameSnapshot,
    required this.notes,
    required this.modifiers,
  });

  factory KdsTicketItem.fromJson(Map<String, dynamic> json) {
    final orderItem = json['orderItem'] as Map<String, dynamic>? ?? const {};
    return KdsTicketItem(
      id: json['id'] as String,
      quantity: json['quantity'] as int? ?? 1,
      status: _kitchenItemStatusFromJson(json['status'] as String? ?? 'NEW'),
      nameSnapshot: orderItem['nameSnapshot'] as String? ?? '',
      variantNameSnapshot: orderItem['variantNameSnapshot'] as String?,
      notes: orderItem['notes'] as String?,
      modifiers: ((orderItem['modifiers'] as List<dynamic>?) ?? const [])
          .map((m) => OrderItemModifierSummary.fromJson(m as Map<String, dynamic>))
          .toList(),
    );
  }

  final String id;
  final int quantity;
  final KitchenItemStatus status;
  final String nameSnapshot;
  final String? variantNameSnapshot;
  final String? notes;
  final List<OrderItemModifierSummary> modifiers;
}

/// One KOT (`KitchenOrder`) — a ticket on the board. An order can produce more than one KOT
/// over its life (`isModification: true` for every KOT after the first — see
/// `OrdersService.addItems` on the backend), so the KDS board is a board of *tickets*, not of
/// orders; two tickets for the same table are two separate cards here, exactly as a physical
/// kitchen printer would produce two separate paper slips.
class KdsTicket {
  const KdsTicket({
    required this.id,
    required this.kotNumber,
    required this.isModification,
    required this.createdAt,
    required this.orderNumber,
    required this.orderType,
    required this.tableName,
    required this.items,
  });

  factory KdsTicket.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map<String, dynamic>? ?? const {};
    final table = order['table'] as Map<String, dynamic>?;
    return KdsTicket(
      id: json['id'] as String,
      kotNumber: json['kotNumber'] as String,
      isModification: json['isModification'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      orderNumber: order['orderNumber'] as String? ?? '',
      orderType: order['type'] as String? ?? 'DINE_IN',
      tableName: table?['name'] as String?,
      items: ((json['items'] as List<dynamic>?) ?? const [])
          .map((i) => KdsTicketItem.fromJson(i as Map<String, dynamic>))
          .toList(),
    );
  }

  final String id;
  final String kotNumber;
  final bool isModification;
  final DateTime createdAt;
  final String orderNumber;
  final String orderType;
  final String? tableName;
  final List<KdsTicketItem> items;

  /// Everything still actionable — mirrors the backend's own queue filter
  /// (`listQueue`'s `items: { some: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }`), so a
  /// ticket whose last item was just marked done can be recognized as finished locally too,
  /// in the gap between that action and the next poll re-fetching the queue.
  bool get hasActiveItems =>
      items.any((i) => i.status != KitchenItemStatus.completed && i.status != KitchenItemStatus.cancelled);
}
