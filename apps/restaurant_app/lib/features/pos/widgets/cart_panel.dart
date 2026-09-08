import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money/money.dart';
import '../data/pos_cart_line.dart';
import '../state/pos_cart.dart';

/// Sticky bottom bar showing the running estimate; tapping it opens the full editable line
/// list. Mirrors the customer PWA's CartBar.tsx + CartScreen.tsx split, collapsed into one
/// widget here since the POS's cart is a much shorter-lived, denser interaction.
class CartPanel extends ConsumerWidget {
  const CartPanel({super.key, required this.onSubmit, required this.submitLabel});

  final Future<void> Function() onSubmit;
  final String submitLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(posCartProvider);
    final cartNotifier = ref.read(posCartProvider.notifier);

    if (cart.isEmpty) return const SizedBox.shrink();

    return SafeArea(
      child: Material(
        elevation: 8,
        color: Theme.of(context).colorScheme.surface,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 160,
                child: ListView(
                  children: [
                    for (final line in cart)
                      _CartLineTile(
                        line: line,
                        onIncrement: () => cartNotifier.setQuantity(line.lineId, line.quantity + 1),
                        onDecrement: () => cartNotifier.setQuantity(line.lineId, line.quantity - 1),
                        onRemove: () => cartNotifier.removeLine(line.lineId),
                      ),
                  ],
                ),
              ),
              const Divider(height: 1),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${cartNotifier.itemCount} item${cartNotifier.itemCount == 1 ? '' : 's'}',
                  ),
                  Text(
                    cartNotifier.estimatedSubtotal.format(),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => onSubmit(),
                child: Text(submitLabel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CartLineTile extends StatelessWidget {
  const _CartLineTile({
    required this.line,
    required this.onIncrement,
    required this.onDecrement,
    required this.onRemove,
  });

  final PosCartLine line;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    var lineUnit = Money.parse(line.unitPrice);
    for (final m in line.modifierSummaries) {
      lineUnit = lineUnit + Money.parse(m.priceDelta);
    }
    final lineTotal = lineUnit.times(line.quantity);

    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(
        line.variantName != null ? '${line.menuItemName} (${line.variantName})' : line.menuItemName,
      ),
      subtitle: line.modifierSummaries.isNotEmpty
          ? Text(line.modifierSummaries.map((m) => m.name).join(', '))
          : null,
      leading: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: onDecrement,
          ),
          Text('${line.quantity}'),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.add_circle_outline),
            onPressed: onIncrement,
          ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(lineTotal.format()),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.delete_outline),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}
