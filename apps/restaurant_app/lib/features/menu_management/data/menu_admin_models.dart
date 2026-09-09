/// Richer, admin-facing mirrors of the read-only models in
/// `lib/features/pos/data/pos_models.dart` (`MenuCategory`/`MenuItem`/`MenuItemVariant`/
/// `ModifierGroup`/`Modifier`). Those exist to render the order-builder cart and deliberately
/// only parse the handful of fields that flow needs — they're missing `isActive`,
/// `displayOrder`, `sku`, `taxGroupId`, and other fields an edit screen needs to round-trip a
/// `PATCH`. Rather than widen the pos-cart models (risking a subtle behavior change in the
/// order-taking flow for a concern it doesn't have) this is a parallel, purpose-built set that
/// parses the exact same `GET /menu` staff tree — see `MenuService.getFullTree`'s `ITEM_INCLUDE`
/// on the backend, which is the single source of truth for this shape. Same
/// not-`@IsUUID()`-validated id convention as everywhere else in this domain (see
/// `CreateMenuItemDto`'s doc comment on the backend) — never assume/validate UUID format here.
class MenuCategoryAdmin {
  const MenuCategoryAdmin({
    required this.id,
    required this.name,
    required this.description,
    required this.displayOrder,
    required this.isActive,
    required this.items,
  });

  factory MenuCategoryAdmin.fromJson(Map<String, dynamic> json) => MenuCategoryAdmin(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String?,
    displayOrder: json['displayOrder'] as int? ?? 0,
    isActive: json['isActive'] as bool? ?? true,
    items: (json['items'] as List<dynamic>? ?? const [])
        .map((i) => MenuItemAdmin.fromJson(i as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String name;
  final String? description;
  final int displayOrder;
  final bool isActive;
  final List<MenuItemAdmin> items;
}

class MenuItemAdmin {
  const MenuItemAdmin({
    required this.id,
    required this.categoryId,
    required this.taxGroupId,
    required this.name,
    required this.description,
    required this.sku,
    required this.imageUrl,
    required this.basePrice,
    required this.isVegetarian,
    required this.isAvailable,
    required this.isActive,
    required this.displayOrder,
    required this.variants,
    required this.modifierGroups,
  });

  factory MenuItemAdmin.fromJson(Map<String, dynamic> json) => MenuItemAdmin(
    id: json['id'] as String,
    categoryId: json['categoryId'] as String,
    taxGroupId: json['taxGroupId'] as String?,
    name: json['name'] as String,
    description: json['description'] as String?,
    sku: json['sku'] as String?,
    imageUrl: json['imageUrl'] as String?,
    // Decimal, serialized as a string by the API — see lib/core/money/money.dart's doc comment
    // on why this app never round-trips a price through double.
    basePrice: json['basePrice'].toString(),
    isVegetarian: json['isVegetarian'] as bool? ?? true,
    isAvailable: json['isAvailable'] as bool? ?? true,
    isActive: json['isActive'] as bool? ?? true,
    displayOrder: json['displayOrder'] as int? ?? 0,
    variants: (json['variants'] as List<dynamic>? ?? const [])
        .map((v) => MenuItemVariantAdmin.fromJson(v as Map<String, dynamic>))
        .toList(),
    modifierGroups: (json['modifierGroups'] as List<dynamic>? ?? const [])
        .map(
          (g) => ModifierGroupAdmin.fromJson(
            (g as Map<String, dynamic>)['modifierGroup'] as Map<String, dynamic>,
          ),
        )
        .toList(),
  );

  final String id;
  final String categoryId;
  final String? taxGroupId;
  final String name;
  final String? description;
  final String? sku;
  final String? imageUrl;
  final String basePrice;
  final bool isVegetarian;

  /// The "86 an item" toggle — temporarily unorderable, still visible/editable everywhere.
  /// Distinct from [isActive] (full soft-delete/hide). See spec §12; must stay in sync live
  /// across POS and QR guest views, which is why toggling it goes through the same
  /// `PATCH /menu/items/:id` as every other field, not a separate endpoint.
  final bool isAvailable;
  final bool isActive;
  final int displayOrder;
  final List<MenuItemVariantAdmin> variants;
  final List<ModifierGroupAdmin> modifierGroups;
}

class MenuItemVariantAdmin {
  const MenuItemVariantAdmin({
    required this.id,
    required this.name,
    required this.priceOverride,
    required this.isDefault,
    required this.isActive,
  });

  factory MenuItemVariantAdmin.fromJson(Map<String, dynamic> json) => MenuItemVariantAdmin(
    id: json['id'] as String,
    name: json['name'] as String,
    // Absolute price, not a delta — unlike Modifier.priceDelta. See UpsertVariantDto's backend
    // doc comment.
    priceOverride: json['priceOverride'].toString(),
    isDefault: json['isDefault'] as bool? ?? false,
    isActive: json['isActive'] as bool? ?? true,
  );

  final String id;
  final String name;
  final String priceOverride;
  final bool isDefault;
  final bool isActive;
}

/// Outlet-scoped and reusable across items (e.g. "Spice Level" used by a dozen dishes) — never
/// nested/owned by a single `MenuItem`, only linked via `MenuItemModifierGroup`. See
/// docs/database.md "Why a reusable ModifierGroup".
class ModifierGroupAdmin {
  const ModifierGroupAdmin({
    required this.id,
    required this.name,
    required this.minSelect,
    required this.maxSelect,
    required this.isRequired,
    required this.displayOrder,
    required this.isActive,
    required this.modifiers,
  });

  factory ModifierGroupAdmin.fromJson(Map<String, dynamic> json) => ModifierGroupAdmin(
    id: json['id'] as String,
    name: json['name'] as String,
    minSelect: json['minSelect'] as int? ?? 0,
    maxSelect: json['maxSelect'] as int? ?? 1,
    isRequired: json['isRequired'] as bool? ?? false,
    displayOrder: json['displayOrder'] as int? ?? 0,
    isActive: json['isActive'] as bool? ?? true,
    modifiers: (json['modifiers'] as List<dynamic>? ?? const [])
        .map((m) => ModifierAdmin.fromJson(m as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String name;
  final int minSelect;
  final int maxSelect;
  final bool isRequired;
  final int displayOrder;
  final bool isActive;
  final List<ModifierAdmin> modifiers;
}

class ModifierAdmin {
  const ModifierAdmin({
    required this.id,
    required this.name,
    required this.priceDelta,
    required this.isActive,
    required this.displayOrder,
  });

  factory ModifierAdmin.fromJson(Map<String, dynamic> json) => ModifierAdmin(
    id: json['id'] as String,
    name: json['name'] as String,
    // Delta, not absolute — unlike MenuItemVariantAdmin.priceOverride. Can be negative in
    // principle (nothing on the backend forbids it) though v1's UI only ever creates >= 0 ones.
    priceDelta: json['priceDelta'].toString(),
    isActive: json['isActive'] as bool? ?? true,
    displayOrder: json['displayOrder'] as int? ?? 0,
  );

  final String id;
  final String name;
  final String priceDelta;
  final bool isActive;
  final int displayOrder;
}

/// Matches `TaxGroupComponent.taxType` on the backend (`services/api/prisma/schema.prisma`).
/// No shared codegen (same limitation as everywhere else in this file) — keep in sync by hand.
enum TaxType { cgst, sgst, igst, serviceCharge }

TaxType taxTypeFromJson(String value) => switch (value) {
  'CGST' => TaxType.cgst,
  'SGST' => TaxType.sgst,
  'IGST' => TaxType.igst,
  'SERVICE_CHARGE' => TaxType.serviceCharge,
  _ => TaxType.cgst,
};

String taxTypeToJson(TaxType type) => switch (type) {
  TaxType.cgst => 'CGST',
  TaxType.sgst => 'SGST',
  TaxType.igst => 'IGST',
  TaxType.serviceCharge => 'SERVICE_CHARGE',
};

String taxTypeLabel(TaxType type) => switch (type) {
  TaxType.cgst => 'CGST',
  TaxType.sgst => 'SGST',
  TaxType.igst => 'IGST',
  TaxType.serviceCharge => 'Service charge',
};

class TaxGroupComponent {
  const TaxGroupComponent({required this.taxType, required this.ratePercent});

  factory TaxGroupComponent.fromJson(Map<String, dynamic> json) => TaxGroupComponent(
    taxType: taxTypeFromJson(json['taxType'] as String),
    ratePercent: json['ratePercent'].toString(),
  );

  final TaxType taxType;
  final String ratePercent;
}

/// `TaxGroup` had no update/delete endpoint at all until now (still only name + `isActive` —
/// see `UpdateTaxGroupDto`'s backend doc comment for why component rates aren't editable
/// in-place). Referenced by `MenuItemAdmin.taxGroupId`.
class TaxGroup {
  const TaxGroup({
    required this.id,
    required this.name,
    required this.isActive,
    required this.components,
  });

  factory TaxGroup.fromJson(Map<String, dynamic> json) => TaxGroup(
    id: json['id'] as String,
    name: json['name'] as String,
    isActive: json['isActive'] as bool? ?? true,
    components: (json['components'] as List<dynamic>? ?? const [])
        .map((c) => TaxGroupComponent.fromJson(c as Map<String, dynamic>))
        .toList(),
  );

  final String id;
  final String name;
  final bool isActive;
  final List<TaxGroupComponent> components;
}
