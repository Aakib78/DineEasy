int _lineIdCounter = 0;

/// A locally-unique id for a cart line — not a security-sensitive identifier and never sent to
/// the server (see PosCartLine.toOrderItemJson, which omits it entirely), just enough to
/// distinguish list entries and target quantity/remove actions correctly. Combines a counter
/// with the clock so two lines added in the same microsecond (a fast double-tap) still differ.
String nextCartLineId() => '${DateTime.now().microsecondsSinceEpoch}-${_lineIdCounter++}';

/// One line in the POS's in-memory cart — the staff-side equivalent of the customer PWA's
/// `CartLine` (apps/customer_web/src/lib/cart/cart-types.ts). Nothing here is persisted:
/// a POS terminal stays powered on through a shift, so unlike the guest app there's no
/// reload-survival need, and a half-built order accidentally surviving an app restart would be
/// more confusing than helpful for staff (they'd rather just re-add the items).
class PosCartLine {
  const PosCartLine({
    required this.lineId,
    required this.menuItemId,
    required this.menuItemName,
    this.variantId,
    this.variantName,
    required this.unitPrice,
    required this.quantity,
    this.notes,
    required this.modifierIds,
    required this.modifierSummaries,
  });

  final String lineId;
  final String menuItemId;
  final String menuItemName;
  final String? variantId;
  final String? variantName;

  /// Decimal string — display estimate only, see PosCart's doc comment.
  final String unitPrice;
  final int quantity;
  final String? notes;
  final List<String> modifierIds;
  final List<({String name, String priceDelta})> modifierSummaries;

  PosCartLine copyWith({int? quantity}) => PosCartLine(
    lineId: lineId,
    menuItemId: menuItemId,
    menuItemName: menuItemName,
    variantId: variantId,
    variantName: variantName,
    unitPrice: unitPrice,
    quantity: quantity ?? this.quantity,
    notes: notes,
    modifierIds: modifierIds,
    modifierSummaries: modifierSummaries,
  );

  Map<String, dynamic> toOrderItemJson() => {
    'menuItemId': menuItemId,
    if (variantId != null) 'menuItemVariantId': variantId,
    'quantity': quantity,
    if (notes != null && notes!.isNotEmpty) 'notes': notes,
    'modifiers': modifierIds.map((id) => {'modifierId': id}).toList(),
  };
}
