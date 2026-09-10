import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money/money.dart';
import '../pos/data/pos_models.dart';
import 'data/dining_session_models.dart';
import 'state/dining_sessions_providers.dart';

/// `GET /dining-sessions/:id` (`DiningSessionsService.getById`) existed with real, working
/// logic — full order + item history for one table's occupancy — but no UI consumer anywhere;
/// `TablesManagementScreen`'s floor plan only ever showed a table's current *status*
/// (Available/Occupied/...), never what's actually happened at it during the current sitting.
/// Reached by tapping the new "View session" action on an occupied table tile there. Read-only
/// by design (see `DiningSession`'s doc comment) — closing the table stays where it already was,
/// the "Available" option in that same screen's edit sheet.
class DiningSessionDetailScreen extends ConsumerWidget {
  const DiningSessionDetailScreen({super.key, required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionAsync = ref.watch(diningSessionDetailProvider(sessionId));

    return Scaffold(
      appBar: AppBar(title: const Text('Table session')),
      body: sessionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (session) => _SessionBody(session: session),
      ),
    );
  }
}

class _SessionBody extends StatelessWidget {
  const _SessionBody({required this.session});

  final DiningSession session;

  @override
  Widget build(BuildContext context) {
    final duration = (session.endedAt ?? DateTime.now()).difference(session.startedAt);
    final activeOrders = session.orders.where((o) => o.status != OrderStatus.cancelled).toList();
    final sessionTotal = activeOrders.fold<Money>(
      Money.zero,
      (sum, o) => sum + Money.parse(o.total),
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      session.status == 'OPEN' ? Icons.people : Icons.event_available,
                      color: session.status == 'OPEN'
                          ? Colors.orange.shade700
                          : Theme.of(context).colorScheme.outline,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      session.tableName ?? 'Table',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const Spacer(),
                    Chip(label: Text(session.status == 'OPEN' ? 'Open' : 'Closed')),
                  ],
                ),
                const SizedBox(height: 12),
                _InfoRow(label: 'Started', value: _formatDateTime(session.startedAt)),
                if (session.endedAt != null)
                  _InfoRow(label: 'Closed', value: _formatDateTime(session.endedAt!)),
                _InfoRow(
                  label: session.status == 'OPEN' ? 'Seated for' : 'Was seated for',
                  value: _formatDuration(duration),
                ),
                _InfoRow(label: 'Orders this sitting', value: '${activeOrders.length}'),
                _InfoRow(label: 'Total so far', value: sessionTotal.format()),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text('Orders', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (session.orders.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('No orders placed in this session yet.'),
          )
        else
          for (final order in session.orders) _OrderCard(order: order),
      ],
    );
  }

  String _formatDateTime(DateTime dt) {
    final local = dt.toLocal();
    final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final m = local.minute.toString().padLeft(2, '0');
    final ampm = local.hour >= 12 ? 'PM' : 'AM';
    return '${local.day}/${local.month}/${local.year} · $h:$m $ampm';
  }

  String _formatDuration(Duration d) {
    if (d.inMinutes < 1) return 'just started';
    if (d.inHours < 1) return '${d.inMinutes}m';
    return '${d.inHours}h ${d.inMinutes % 60}m';
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final cancelled = order.status == OrderStatus.cancelled;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    order.orderNumber,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                Chip(
                  label: Text(_statusLabel(order.status)),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: cancelled
                      ? Theme.of(context).colorScheme.errorContainer
                      : null,
                ),
              ],
            ),
            // `items` is only populated when this order came through
            // `diningSessionDetailProvider` (`GET /dining-sessions/:id` includes them) — the
            // bare `openDiningSessionsProvider` list never reaches this widget, only the detail
            // screen does, so this is never silently empty for the wrong reason.
            for (final item in order.items)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    Text('${item.quantity}× '),
                    Expanded(
                      child: Text(
                        item.variantNameSnapshot != null
                            ? '${item.nameSnapshot} (${item.variantNameSnapshot})'
                            : item.nameSnapshot,
                        style: item.isCancelled
                            ? const TextStyle(decoration: TextDecoration.lineThrough)
                            : null,
                      ),
                    ),
                    Text(Money.parse(item.total).format()),
                  ],
                ),
              ),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Total', style: Theme.of(context).textTheme.bodyMedium),
                Text(
                  Money.parse(order.total).format(),
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _statusLabel(OrderStatus status) => switch (status) {
    OrderStatus.draft => 'Draft',
    OrderStatus.placed => 'Placed',
    OrderStatus.accepted => 'Accepted',
    OrderStatus.preparing => 'Preparing',
    OrderStatus.ready => 'Ready',
    OrderStatus.served => 'Served',
    OrderStatus.billed => 'Billed',
    OrderStatus.paid => 'Paid',
    OrderStatus.completed => 'Completed',
    OrderStatus.cancelled => 'Cancelled',
    OrderStatus.refunded => 'Refunded',
  };
}
