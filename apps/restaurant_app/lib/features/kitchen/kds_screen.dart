import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/network/api_exception.dart';
import '../../core/rbac/permissions.dart';
import 'data/kds_models.dart';
import 'state/kitchen_providers.dart';

/// The kitchen display (spec §8): a board of KOTs ("tickets"), oldest first, each item movable
/// through NEW → PREPARING → READY → COMPLETED (or CANCELLED at any point before COMPLETED —
/// see `assertKitchenItemTransition` on the backend, which is the actual enforcement; this
/// screen only ever offers the one legal next action per item). `Order.status` itself is
/// derived server-side from item-level progress (`KitchenService.recomputeOrderStatus`) — this
/// screen never touches order status directly, only kitchen-item status.
class KdsScreen extends ConsumerStatefulWidget {
  const KdsScreen({super.key});

  @override
  ConsumerState<KdsScreen> createState() => _KdsScreenState();
}

class _KdsScreenState extends ConsumerState<KdsScreen> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    // No WebSocket "refetch hint" wired up on the Flutter side yet (see kitchen_providers.dart's
    // doc comment) — a fixed poll is the interim way a live board stays current. 6s keeps the
    // board feeling live without hammering the LAN server from every terminal in the kitchen.
    _pollTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (mounted) ref.invalidate(kdsQueueProvider);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final stationsAsync = ref.watch(kitchenStationsProvider);
    final queueAsync = ref.watch(kdsQueueProvider);
    final selectedStationId = ref.watch(selectedKitchenStationIdProvider);
    // `kitchen.view` (checked by home_shell to show this tab) is read-only — advancing/
    // cancelling an item needs `kitchen.update`. A manager who can see the board but shouldn't
    // touch it (e.g. auditing from an office terminal) gets a read-only board instead of buttons
    // guaranteed to 403 — UX only, `PermissionsGuard` on the server is the real gate.
    final canUpdate = ref.watch(currentUserProvider)?.hasPermission(Permissions.kitchenUpdate) ?? false;

    return Scaffold(
      body: Column(
        children: [
          stationsAsync.maybeWhen(
            data: (stations) => stations.isEmpty
                ? const SizedBox.shrink()
                : SizedBox(
                    height: 48,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: const Text('All stations'),
                            selected: selectedStationId == null,
                            onSelected: (_) => ref
                                .read(selectedKitchenStationIdProvider.notifier)
                                .state = null,
                          ),
                        ),
                        for (final station in stations)
                          Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: ChoiceChip(
                              label: Text(station.name),
                              selected: selectedStationId == station.id,
                              onSelected: (_) => ref
                                  .read(selectedKitchenStationIdProvider.notifier)
                                  .state = station.id,
                            ),
                          ),
                      ],
                    ),
                  ),
            orElse: () => const SizedBox.shrink(),
          ),
          Expanded(
            child: queueAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('$error', textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: () => ref.invalidate(kdsQueueProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (tickets) {
                final active = tickets.where((t) => t.hasActiveItems).toList()
                  ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

                if (active.isEmpty) {
                  return Center(
                    child: Text(
                      'No open tickets — the kitchen is caught up.',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  );
                }

                return ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.all(12),
                  children: [
                    for (final ticket in active)
                      Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: _TicketCard(ticket: ticket, canUpdate: canUpdate),
                      ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.canUpdate});

  final KdsTicket ticket;
  final bool canUpdate;

  @override
  Widget build(BuildContext context) {
    final elapsed = DateTime.now().difference(ticket.createdAt);
    // Thresholds are a reasonable-default heuristic, not something the spec pins a number to —
    // flagged here so a real kitchen can tune them per menu (a pizza station's "late" isn't a
    // salad station's "late").
    final urgencyColor = elapsed.inMinutes >= 10
        ? Colors.red.shade600
        : elapsed.inMinutes >= 5
        ? Colors.amber.shade700
        : Colors.green.shade700;

    return SizedBox(
      width: 280,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: urgencyColor,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      ticket.tableName != null
                          ? '${ticket.tableName} · ${ticket.kotNumber}'
                          : 'Takeaway · ${ticket.kotNumber}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    _formatElapsed(elapsed),
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
            if (ticket.isModification)
              Container(
                width: double.infinity,
                color: Theme.of(context).colorScheme.secondaryContainer,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: Text(
                  'Added to order ${ticket.orderNumber}',
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: [
                  for (final item in ticket.items)
                    _TicketItemRow(item: item, canUpdate: canUpdate),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatElapsed(Duration elapsed) {
    if (elapsed.inMinutes < 1) return '<1m';
    return '${elapsed.inMinutes}m';
  }
}

class _TicketItemRow extends ConsumerStatefulWidget {
  const _TicketItemRow({required this.item, required this.canUpdate});

  final KdsTicketItem item;
  final bool canUpdate;

  @override
  ConsumerState<_TicketItemRow> createState() => _TicketItemRowState();
}

class _TicketItemRowState extends ConsumerState<_TicketItemRow> {
  bool _updating = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final struckThrough = item.status == KitchenItemStatus.completed;

    return Opacity(
      opacity: item.status == KitchenItemStatus.cancelled ? 0.4 : 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${item.quantity}× ${item.nameSnapshot}'
                    '${item.variantNameSnapshot != null ? ' (${item.variantNameSnapshot})' : ''}',
                    style: TextStyle(
                      decoration: struckThrough ? TextDecoration.lineThrough : null,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (item.modifiers.isNotEmpty)
                    Text(
                      item.modifiers.map((m) => m.nameSnapshot).join(', '),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  if (item.notes != null && item.notes!.isNotEmpty)
                    Text(
                      item.notes!,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
                    ),
                  if (_error != null)
                    Text(
                      _error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 11),
                    ),
                ],
              ),
            ),
            if (widget.canUpdate)
              _ActionButton(
                status: item.status,
                busy: _updating,
                onAdvance: () => _updateStatus(_nextStatus(item.status)),
                onCancel: () => _updateStatus(KitchenItemStatus.cancelled),
              ),
          ],
        ),
      ),
    );
  }

  KitchenItemStatus? _nextStatus(KitchenItemStatus current) => switch (current) {
    KitchenItemStatus.newItem => KitchenItemStatus.preparing,
    KitchenItemStatus.preparing => KitchenItemStatus.ready,
    KitchenItemStatus.ready => KitchenItemStatus.completed,
    KitchenItemStatus.completed => null,
    KitchenItemStatus.cancelled => null,
  };

  Future<void> _updateStatus(KitchenItemStatus? target) async {
    if (target == null || _updating) return;

    setState(() {
      _updating = true;
      _error = null;
    });

    try {
      await ref.read(kitchenRepositoryProvider).updateItemStatus(widget.item.id, target);
      ref.invalidate(kdsQueueProvider);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.status,
    required this.busy,
    required this.onAdvance,
    required this.onCancel,
  });

  final KitchenItemStatus status;
  final bool busy;
  final VoidCallback onAdvance;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    if (status == KitchenItemStatus.completed || status == KitchenItemStatus.cancelled) {
      return const SizedBox(width: 8);
    }

    final label = switch (status) {
      KitchenItemStatus.newItem => 'Start',
      KitchenItemStatus.preparing => 'Ready',
      KitchenItemStatus.ready => 'Done',
      KitchenItemStatus.completed => '',
      KitchenItemStatus.cancelled => '',
    };

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 32,
          child: FilledButton(
            onPressed: busy ? null : onAdvance,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              visualDensity: VisualDensity.compact,
            ),
            child: busy
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(label),
          ),
        ),
        TextButton(
          onPressed: busy ? null : onCancel,
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            visualDensity: VisualDensity.compact,
            minimumSize: const Size(0, 24),
          ),
          child: const Text('Cancel', style: TextStyle(fontSize: 11)),
        ),
      ],
    );
  }
}
