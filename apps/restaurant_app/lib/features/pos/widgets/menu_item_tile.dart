import 'package:flutter/material.dart';

import '../../../core/money/money.dart';
import '../data/pos_models.dart';

class MenuItemTile extends StatelessWidget {
  const MenuItemTile({super.key, required this.item, required this.onTap});

  final MenuItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final fromPrice = item.variants.isNotEmpty
        ? item.variants.map((v) => Money.parse(v.priceOverride)).reduce(
            (a, b) => a <= b ? a : b,
          )
        : Money.parse(item.basePrice);

    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        onTap: item.isAvailable ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 10,
                height: 10,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: item.isVegetarian ? Colors.green.shade700 : Colors.red.shade700,
                    width: 1.5,
                  ),
                ),
                child: Center(
                  child: Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: item.isVegetarian ? Colors.green.shade700 : Colors.red.shade700,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.name, style: Theme.of(context).textTheme.titleSmall),
                    if (item.description != null && item.description!.isNotEmpty)
                      Text(
                        item.description!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    const SizedBox(height: 4),
                    Text(
                      item.isAvailable
                          ? '${item.variants.isNotEmpty ? "From " : ""}${fromPrice.format()}'
                          : 'Unavailable',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: item.isAvailable ? null : Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ],
                ),
              ),
              if (item.isAvailable) const Icon(Icons.add_circle_outline),
            ],
          ),
        ),
      ),
    );
  }
}
