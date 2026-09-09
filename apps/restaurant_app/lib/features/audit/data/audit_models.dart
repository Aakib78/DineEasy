/// Mirrors `AuditLog` (`services/api/prisma/schema.prisma`) as returned by
/// `AuditLogService.listForOrganization` — includes the actor's name (a join the service added
/// alongside this screen; a raw `actorUserId` UUID was useless to a human reading a log).
class AuditLogEntry {
  const AuditLogEntry({
    required this.id,
    required this.action,
    required this.entityType,
    required this.entityId,
    required this.actorName,
    required this.previousState,
    required this.newState,
    required this.createdAt,
  });

  factory AuditLogEntry.fromJson(Map<String, dynamic> json) => AuditLogEntry(
    id: json['id'] as String,
    action: json['action'] as String,
    entityType: json['entityType'] as String,
    entityId: json['entityId'] as String,
    // `actor` is null for a system-initiated entry (none exist in v1 today, but the schema
    // column is nullable — see AuditLog.actorUserId) — falls back to a generic label.
    actorName: (json['actor'] as Map<String, dynamic>?)?['name'] as String?,
    previousState: json['previousState'] as Map<String, dynamic>?,
    newState: json['newState'] as Map<String, dynamic>?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final String id;

  /// `"<entity>.<verb>"` snake_case, e.g. `"menu_item.price_changed"` — every call site across
  /// the backend follows this convention (see `AuditLogService.record`'s doc comment), so this
  /// screen humanizes it generically rather than hardcoding a label per action.
  final String action;
  final String entityType;
  final String entityId;
  final String? actorName;

  /// Untyped by design — an audit log records whatever the entity looked like before/after,
  /// which differs per `entityType`. Rendered as raw indented JSON rather than a bespoke view
  /// per entity type.
  final Map<String, dynamic>? previousState;
  final Map<String, dynamic>? newState;
  final DateTime createdAt;
}

/// `"menu_item.price_changed"` → `"Menu item price changed"`.
String humanizeAuditAction(String action) {
  final words = action.replaceAll('.', ' ').replaceAll('_', ' ').split(' ')
    ..removeWhere((w) => w.isEmpty);
  if (words.isEmpty) return action;
  return [
    words.first[0].toUpperCase() + words.first.substring(1),
    ...words.skip(1),
  ].join(' ');
}
