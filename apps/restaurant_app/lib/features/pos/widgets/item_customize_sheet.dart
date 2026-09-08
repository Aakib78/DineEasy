import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money/money.dart';
import '../data/pos_cart_line.dart';
import '../data/pos_models.dart';
import '../state/pos_cart.dart';

/// Staff-side equivalent of the customer PWA's `ItemCustomizeSheet.tsx` — same variant/
/// modifier selection rules (min/max/required enforced here as UX; the server independently
/// re-validates at order time regardless, see OrdersService.priceItems on the backend), adapted
/// to a bottom sheet + Riverpod cart instead of a React modal + context cart.
class ItemCustomizeSheet extends ConsumerStatefulWidget {
  const ItemCustomizeSheet({super.key, required this.item});

  final MenuItem item;

  static Future<void> show(BuildContext context, MenuItem item) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => ItemCustomizeSheet(item: item),
    );
  }

  @override
  ConsumerState<ItemCustomizeSheet> createState() => _ItemCustomizeSheetState();
}

class _ItemCustomizeSheetState extends ConsumerState<ItemCustomizeSheet> {
  String? _variantId;
  final Set<String> _selectedModifierIds = {};
  int _quantity = 1;
  final _notesController = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.item.variants.isNotEmpty) {
      final defaultVariant = widget.item.variants.firstWhere(
        (v) => v.isDefault,
        orElse: () => widget.item.variants.first,
      );
      _variantId = defaultVariant.id;
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;

    final unitPrice = _variantId != null
        ? item.variants.firstWhere((v) => v.id == _variantId).priceOverride
        : item.basePrice;

    final allModifiers = <Modifier>[
      for (final link in item.modifierGroups) ...link.modifierGroup.modifiers,
    ];

    var estimatedTotal = Money.parse(unitPrice);
    for (final modifier in allModifiers) {
      if (_selectedModifierIds.contains(modifier.id)) {
        estimatedTotal = estimatedTotal + Money.parse(modifier.priceDelta);
      }
    }
    estimatedTotal = estimatedTotal.times(_quantity);

    final missingRequiredGroup = item.modifierGroups
        .map((l) => l.modifierGroup)
        .where((g) => g.isRequired || g.minSelect > 0)
        .where((g) {
          final groupIds = g.modifiers.map((m) => m.id).toSet();
          final selectedCount = _selectedModifierIds.intersection(groupIds).length;
          return selectedCount < (g.minSelect > 0 ? g.minSelect : 1);
        })
        .isNotEmpty;

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 20,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: ListView(
          controller: scrollController,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(item.name, style: Theme.of(context).textTheme.headlineSmall),
                ),
                IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
              ],
            ),
            if (item.description != null && item.description!.isNotEmpty)
              Text(item.description!, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 12),
            if (item.variants.isNotEmpty) ...[
              Text('Choose one', style: Theme.of(context).textTheme.titleSmall),
              for (final variant in item.variants)
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  value: variant.id,
                  groupValue: _variantId,
                  onChanged: (v) => setState(() => _variantId = v),
                  title: Text(variant.name),
                  secondary: Text(Money.parse(variant.priceOverride).format()),
                ),
              const Divider(),
            ],
            for (final link in item.modifierGroups) ...[
              Row(
                children: [
                  Text(link.modifierGroup.name, style: Theme.of(context).textTheme.titleSmall),
                  if (link.modifierGroup.isRequired || link.modifierGroup.minSelect > 0)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Chip(
                        label: const Text('Required'),
                        visualDensity: VisualDensity.compact,
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                ],
              ),
              for (final modifier in link.modifierGroup.modifiers)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _selectedModifierIds.contains(modifier.id),
                  onChanged: (checked) =>
                      _toggleModifier(link.modifierGroup, modifier.id, checked ?? false),
                  title: Text(modifier.name),
                  secondary: Money.parse(modifier.priceDelta) > Money.zero
                      ? Text('+${Money.parse(modifier.priceDelta).format()}')
                      : null,
                ),
              const Divider(),
            ],
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Special instructions (optional)',
                border: OutlineInputBorder(),
              ),
              minLines: 1,
              maxLines: 2,
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: () => setState(() => _quantity = (_quantity - 1).clamp(1, 99)),
                  icon: const Icon(Icons.remove_circle_outline),
                ),
                Text('$_quantity', style: Theme.of(context).textTheme.titleLarge),
                IconButton(
                  onPressed: () => setState(() => _quantity = (_quantity + 1).clamp(1, 99)),
                  icon: const Icon(Icons.add_circle_outline),
                ),
              ],
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: missingRequiredGroup ? null : _addToCart,
              child: Text('Add $_quantity to order — ${estimatedTotal.format()}'),
            ),
          ],
        ),
      ),
    );
  }

  void _toggleModifier(ModifierGroup group, String modifierId, bool checked) {
    setState(() {
      final groupIds = group.modifiers.map((m) => m.id).toSet();
      final selectedInGroup = _selectedModifierIds.intersection(groupIds);

      if (!checked) {
        _selectedModifierIds.remove(modifierId);
        return;
      }

      if (group.maxSelect == 1) {
        _selectedModifierIds.removeAll(selectedInGroup);
        _selectedModifierIds.add(modifierId);
        return;
      }

      if (selectedInGroup.length >= group.maxSelect) return; // at the cap, ignore
      _selectedModifierIds.add(modifierId);
    });
  }

  void _addToCart() {
    final item = widget.item;
    final unitPrice = _variantId != null
        ? item.variants.firstWhere((v) => v.id == _variantId).priceOverride
        : item.basePrice;
    final variantName = _variantId != null
        ? item.variants.firstWhere((v) => v.id == _variantId).name
        : null;

    final allModifiers = <Modifier>[
      for (final link in item.modifierGroups) ...link.modifierGroup.modifiers,
    ];
    final selected = allModifiers.where((m) => _selectedModifierIds.contains(m.id)).toList();

    ref
        .read(posCartProvider.notifier)
        .addLine(
          PosCartLine(
            lineId: nextCartLineId(),
            menuItemId: item.id,
            menuItemName: item.name,
            variantId: _variantId,
            variantName: variantName,
            unitPrice: unitPrice,
            quantity: _quantity,
            notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
            modifierIds: selected.map((m) => m.id).toList(),
            modifierSummaries: [
              for (final m in selected) (name: m.name, priceDelta: m.priceDelta),
            ],
          ),
        );

    Navigator.pop(context);
  }
}
