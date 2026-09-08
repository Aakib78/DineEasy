/// Mirrors the shapes returned by MenuController/TablesController/OrdersController
/// (services/api/src/modules/menu, .../tables, .../orders). Hand-written, same gap noted in
/// docs/flutter-app.md and docs/customer-web.md's RBAC/type-mirroring sections — no shared
/// codegen pipeline for Dart yet.
library;

class Floor {
  const Floor({required this.id, required this.name, required this.displayOrder});

  factory Floor.fromJson(Map<String, dynamic> json) => Floor(
    id: json['id'] as String,
    name: json['name'] as String,
    displayOrder: json['displayOrder'] as int? ?? 0,
  );

  final String id;
  final String name;
  final int displayOrder;
}

enum TableStatus { available, occupied, reserved, disabled }

TableStatus _tableStatusFromJson(String value) => switch (value) {
  'AVAILABLE' => TableStatus.available,
  'OCCUPIED' => TableStatus.occupied,
  'RESERVED' => TableStatus.reserved,
  'DISABLED' => TableStatus.disabled,
  _ => TableStatus.available,
};

/// The reverse of `_tableStatusFromJson`, for `PATCH /tables/:id` — see UpdateTableDto on the
/// backend (`@IsIn(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'DISABLED'])`).
String tableStatusToJson(TableStatus status) => switch (status) {
  TableStatus.available => 'AVAILABLE',
  TableStatus.occupied => 'OCCUPIED',
  TableStatus.reserved => 'RESERVED',
  TableStatus.disabled => 'DISABLED',
};

/// The `RestaurantTable.qrCode` nested row — `TABLE_INCLUDE` on the backend always joins it
/// (schema: `tableId` is `@unique`, so a table has exactly one). Used by the Tables management
/// screen (`lib/features/tables/`) to show/regenerate a table's scan token; the POS floor view
/// (`lib/features/pos/`) doesn't need it and only reads the fields above.
class TableQrCode {
  const TableQrCode({required this.token, required this.isActive});

  factory TableQrCode.fromJson(Map<String, dynamic> json) => TableQrCode(
    token: json['token'] as String,
    isActive: json['isActive'] as bool? ?? true,
  );

  final String token;
  final bool isActive;
}

class RestaurantTable {
  const RestaurantTable({
    required this.id,
    required this.floorId,
    required this.name,
    required this.capacity,
    required this.displayOrder,
    required this.status,
    required this.hasOpenDiningSession,
    required this.qrCode,
  });

  factory RestaurantTable.fromJson(Map<String, dynamic> json) {
    final sessions = json['diningSessions'] as List<dynamic>? ?? const [];
    final qrJson = json['qrCode'] as Map<String, dynamic>?;
    return RestaurantTable(
      id: json['id'] as String,
      floorId: json['floorId'] as String,
      name: json['name'] as String,
      capacity: json['capacity'] as int? ?? 2,
      displayOrder: json['displayOrder'] as int? ?? 0,
      status: _tableStatusFromJson(json['status'] as String? ?? 'AVAILABLE'),
      // TablesService.TABLE_INCLUDE only ever returns the current OPEN session, if any — see
      // its doc comment on the backend ("so the POS floor view can render occupancy at a glance").
      hasOpenDiningSession: sessions.isNotEmpty,
      qrCode: qrJson != null ? TableQrCode.fromJson(qrJson) : null,
    );
  }

  final String id;
  final String floorId;
  final String name;
  final int capacity;
  final int displayOrder;
  final TableStatus status;
  final bool hasOpenDiningSession;
  final TableQrCode? qrCode;
}

class Modifier {
  const Modifier({required this.id, required this.name, required this.priceDelta});

  factory Modifier.fromJson(Map<String, dynamic> json) => Modifier(
    id: json['id'] as String,
    name: json['name'] as String,
    priceDelta: json['priceDelta'].toString(),
  );

  final String id;
  final String name;

  /// Decimal, serialized as a string by the API — never parsed as double; see
  /// lib/core/money/money.dart for how this is combined into totals.
  final String priceDelta;
}

class ModifierGroup {
  const ModifierGroup({
    required this.id,
    required this.name,
    required this.minSelect,
    required this.maxSelect,
    required this.isRequired,
    required this.modifiers,
  });

  factory ModifierGroup.fromJson(Map<String, dynamic> json) => ModifierGroup(
    id: json['id'] as String,
    name: json['name'] as String,
    minSelect: json['minSelect'] as int? ?? 0,
    maxSelect: json['maxSelect'] as int? ?? 1,
    isRequired: json['isRequired'] as bool? ?? false,
    modifiers: (json['modifiers'] as List<dynamic>? ?? const [])
        .map((m) => Modifier.fromJson(m as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final bool isRequired;
  final List<Modifier> modifiers;
}

/// The `MenuItem.modifierGroups` join-row shape — the group itself is nested under `modifierGroup`.
class MenuItemModifierGroupLink {
  const MenuItemModifierGroupLink({required this.modifierGroup});

  factory MenuItemModifierGroupLink.fromJson(Map<String, dynamic> json) =>
      MenuItemModifierGroupLink(
        modifierGroup: ModifierGroup.fromJson(json['modifierGroup'] as Map<String, dynamic>),
      );

  final ModifierGroup modifierGroup;
}

class MenuItemVariant {
  const MenuItemVariant({
    required this.id,
    required this.name,
    required this.priceOverride,
    required this.isDefault,
  });

  factory MenuItemVariant.fromJson(Map<String, dynamic> json) => MenuItemVariant(
    id: json['id'] as String,
    name: json['name'] as String,
    priceOverride: json['priceOverride'].toString(),
    isDefault: json['isDefault'] as bool? ?? false,
  );

  final String id;
  final String name;
  final String priceOverride;
  final bool isDefault;
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.description,
    required this.basePrice,
    required this.isVegetarian,
    required this.isAvailable,
    required this.variants,
    required this.modifierGroups,
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) => MenuItem(
    id: json['id'] as String,
    categoryId: json['categoryId'] as String,
    name: json['name'] as String,
    description: json['description'] as String?,
    basePrice: json['basePrice'].toString(),
    isVegetarian: json['isVegetarian'] as bool? ?? true,
    isAvailable: json['isAvailable'] as bool? ?? true,
    variants: (json['variants'] as List<dynamic>? ?? const [])
        .map((v) => MenuItemVariant.fromJson(v as Map<String, dynamic>))
        .toList(),
    modifierGroups: (json['modifierGroups'] as List<dynamic>? ?? const [])
        .map((g) => MenuItemModifierGroupLink.fromJson(g as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String categoryId;
  final String name;
  final String? description;
  final String basePrice;
  final bool isVegetarian;
  final bool isAvailable;
  final List<MenuItemVariant> variants;
  final List<MenuItemModifierGroupLink> modifierGroups;
}

class MenuCategory {
  const MenuCategory({required this.id, required this.name, required this.items});

  factory MenuCategory.fromJson(Map<String, dynamic> json) => MenuCategory(
    id: json['id'] as String,
    name: json['name'] as String,
    items: (json['items'] as List<dynamic>? ?? const [])
        .map((i) => MenuItem.fromJson(i as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String name;
  final List<MenuItem> items;
}

enum OrderStatus {
  draft,
  placed,
  accepted,
  preparing,
  ready,
  served,
  billed,
  paid,
  completed,
  cancelled,
  refunded,
}

OrderStatus _orderStatusFromJson(String value) => switch (value) {
  'DRAFT' => OrderStatus.draft,
  'PLACED' => OrderStatus.placed,
  'ACCEPTED' => OrderStatus.accepted,
  'PREPARING' => OrderStatus.preparing,
  'READY' => OrderStatus.ready,
  'SERVED' => OrderStatus.served,
  'BILLED' => OrderStatus.billed,
  'PAID' => OrderStatus.paid,
  'COMPLETED' => OrderStatus.completed,
  'CANCELLED' => OrderStatus.cancelled,
  'REFUNDED' => OrderStatus.refunded,
  _ => OrderStatus.draft,
};

class OrderItemModifierSummary {
  const OrderItemModifierSummary({required this.nameSnapshot, required this.priceDeltaSnapshot});

  factory OrderItemModifierSummary.fromJson(Map<String, dynamic> json) =>
      OrderItemModifierSummary(
        nameSnapshot: json['nameSnapshot'] as String,
        priceDeltaSnapshot: json['priceDeltaSnapshot'].toString(),
      );

  final String nameSnapshot;
  final String priceDeltaSnapshot;
}

class OrderItemSummary {
  const OrderItemSummary({
    required this.id,
    required this.nameSnapshot,
    required this.variantNameSnapshot,
    required this.quantity,
    required this.total,
    required this.isCancelled,
    required this.modifiers,
  });

  factory OrderItemSummary.fromJson(Map<String, dynamic> json) => OrderItemSummary(
    id: json['id'] as String,
    nameSnapshot: json['nameSnapshot'] as String,
    variantNameSnapshot: json['variantNameSnapshot'] as String?,
    quantity: json['quantity'] as int? ?? 1,
    total: json['total'].toString(),
    isCancelled: json['isCancelled'] as bool? ?? false,
    modifiers: (json['modifiers'] as List<dynamic>? ?? const [])
        .map((m) => OrderItemModifierSummary.fromJson(m as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String nameSnapshot;
  final String? variantNameSnapshot;
  final int quantity;
  final String total;
  final bool isCancelled;
  final List<OrderItemModifierSummary> modifiers;
}

class Order {
  const Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.type,
    required this.tableId,
    required this.total,
    required this.items,
  });

  factory Order.fromJson(Map<String, dynamic> json) => Order(
    id: json['id'] as String,
    orderNumber: json['orderNumber'] as String,
    status: _orderStatusFromJson(json['status'] as String? ?? 'DRAFT'),
    type: json['type'] as String? ?? 'DINE_IN',
    tableId: json['tableId'] as String?,
    total: json['total'].toString(),
    items: (json['items'] as List<dynamic>? ?? const [])
        .map((i) => OrderItemSummary.fromJson(i as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String orderNumber;
  final OrderStatus status;
  final String type;
  final String? tableId;
  final String total;
  final List<OrderItemSummary> items;
}
