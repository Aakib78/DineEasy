import 'package:flutter/material.dart';

import '../data/pos_models.dart';

/// A table's color communicates status at a glance — the whole point of a POS floor view
/// (spec §5's "at-a-glance table status"). `hasActiveOrder` is derived client-side from the
/// active-orders list (see OrderEntryScreen) rather than trusted from `RestaurantTable.status`
/// alone, since `status` (AVAILABLE/OCCUPIED/RESERVED/DISABLED) is a staff-set flag, not
/// necessarily kept in lockstep with whether an order actually exists — a table can be manually
/// marked OCCUPIED for a walk-in group before any order is placed.
class TableTile extends StatelessWidget {
  const TableTile({
    super.key,
    required this.table,
    required this.hasActiveOrder,
    required this.onTap,
  });

  final RestaurantTable table;
  final bool hasActiveOrder;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final disabled = table.status == TableStatus.disabled;
    final (background, foreground, label) = switch (table.status) {
      TableStatus.disabled => (
        Theme.of(context).colorScheme.surfaceContainerHighest,
        Theme.of(context).colorScheme.outline,
        'Disabled',
      ),
      TableStatus.reserved => (Colors.amber.shade100, Colors.amber.shade900, 'Reserved'),
      _ when hasActiveOrder => (Colors.orange.shade100, Colors.orange.shade900, 'Order open'),
      TableStatus.occupied => (Colors.orange.shade100, Colors.orange.shade900, 'Occupied'),
      TableStatus.available => (Colors.green.shade50, Colors.green.shade800, 'Available'),
    };

    return Material(
      color: background,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: disabled ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                table.name,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(color: foreground, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                '${table.capacity} seats',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: foreground),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: Theme.of(
                  context,
                ).textTheme.labelSmall?.copyWith(color: foreground, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
