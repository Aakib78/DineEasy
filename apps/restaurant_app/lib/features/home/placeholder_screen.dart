import 'package:flutter/material.dart';

/// Reused by every nav destination whose real feature hasn't landed yet (see
/// docs/architecture.md §15 "Build status" for what's implemented vs. planned). Deliberately
/// explicit rather than a blank screen, so it's obvious to anyone clicking around mid-build
/// that this is a known gap, not a bug.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 16),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            'Coming in a later slice',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.outline),
          ),
        ],
      ),
    );
  }
}
