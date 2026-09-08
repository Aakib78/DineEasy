/// Mirrors `NotificationsController`/`NotificationsService`'s response shape
/// (services/api/src/modules/notifications) — same hand-mirrored-model gap noted throughout
/// `lib/features/pos/data/pos_models.dart`, no shared codegen pipeline for Dart yet.
library;

/// Kept as a raw string rather than an enum, deliberately, unlike `KitchenItemStatus` — v1 has
/// exactly one value (`ORDER_READY`, see the backend's `NotificationsService` doc comment for
/// why), and every place this app reads `type` (icon choice) already falls back gracefully for
/// anything it doesn't recognize. An enum here would need the same "unknown value" fallback
/// path anyway, so a raw string keeps a future second type from requiring a client update just
/// to stop throwing.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.entityType,
    required this.entityId,
    required this.readAt,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
    id: json['id'] as String,
    type: json['type'] as String? ?? '',
    title: json['title'] as String? ?? '',
    body: json['body'] as String? ?? '',
    entityType: json['entityType'] as String?,
    entityId: json['entityId'] as String?,
    readAt: json['readAt'] == null ? null : DateTime.parse(json['readAt'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final String id;
  final String type;
  final String title;
  final String body;
  final String? entityType;
  final String? entityId;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isUnread => readAt == null;
}
