import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money/money.dart';
import '../../core/realtime/realtime_providers.dart';
import 'data/pos_models.dart';
import 'order_builder_screen.dart';
import 'state/pos_providers.dart';
import 'widgets/table_tile.dart';

/// The POS tab's landing screen: a floor-by-floor table grid plus a "Takeaway" entry point,
/// mirroring the front-of-house's mental model (spec §5) rather than presenting tables as a
/// flat list. This screen only ever *finds or starts* an order — all the actual menu browsing /
/// cart building happens one level down in OrderBuilderScreen, kept separate so this screen's
/// job stays legible: "which table (or takeaway slot) am I working on?"
///
/// A dine-in order always has a reopen path even after staff navigate away — tapping its table
/// again finds it in `activeOrders` (see `_openTable`). A takeaway order has no table, so
/// before the "Active takeaway orders" list below existed, one placed and then navigated away
/// from was permanently unreachable: it never appears in Billing's Incomplete tab (billable
/// only from `SERVED` onward) and the Kitchen Display has no order-detail navigation at all, so
/// nothing could ever accept it, mark it served, cancel it, or add items to it. This list is
/// that missing reopen path — the takeaway equivalent of tapping an occupied table.
class PosHomeScreen extends ConsumerStatefulWidget {
  const PosHomeScreen({super.key});

  @override
  ConsumerState<PosHomeScreen> createState() => _PosHomeScreenState();
}

class _PosHomeScreenState extends ConsumerState<PosHomeScreen> {
  String? _selectedFloorId;
  StreamSubscription<void>? _orderRealtimeSub;
  StreamSubscription<void>? _tableRealtimeSub;

  @override
  void initState() {
    super.initState();
    // This screen has no polling of its own — before this, it only ever refreshed on its own
    // actions (place/serve an order) or an explicit pull-to-refresh, so another terminal
    // placing a QR order, another staff member marking something served, or a table's
    // occupancy changing elsewhere would sit stale here indefinitely. `order.updated` and
    // `table.updated` (see core/realtime/realtime_service.dart) close that gap directly — this
    // is also specifically what makes "Order open" clear live once an order is paid off
    // elsewhere, rather than only after a manual pull-to-refresh (see docs/troubleshooting.md's
    // "table.status and Order open are independent signals" entry for the underlying mechanic
    // this is now keeping current automatically).
    final realtime = ref.read(realtimeServiceProvider);
    _orderRealtimeSub = realtime.orderUpdated.listen((_) {
      if (mounted) ref.invalidate(activeOrdersProvider);
    });
    _tableRealtimeSub = realtime.tableUpdated.listen((_) {
      if (mounted) ref.invalidate(tablesProvider);
    });
  }

  @override
  void dispose() {
    _orderRealtimeSub?.cancel();
    _tableRealtimeSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final floorsAsync = ref.watch(floorsProvider);
    final tablesAsync = ref.watch(tablesProvider);
    final activeOrdersAsync = ref.watch(activeOrdersProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(floorsProvider);
        ref.invalidate(tablesProvider);
        ref.invalidate(activeOrdersProvider);
        // Wait for the re-fetch so the refresh indicator doesn't spin forever. `.then((_) {})`
        // normalizes all three futures to `Future<void>` — the three providers resolve to
        // unrelated list types (Floor/RestaurantTable/Order), and giving Future.wait a mixed
        // list of futures with no simplifying transform is the kind of type inference this
        // sandbox has no Dart compiler to actually confirm, so this sidesteps it rather than
        // relying on it. A failure here just surfaces to Flutter's default error handling and
        // stops the spinner — the screen's own `AsyncValue.when` blocks already render each
        // provider's error state independently, so nothing is silently lost.
        await Future.wait<void>([
          ref.read(floorsProvider.future).then((_) {}),
          ref.read(tablesProvider.future).then((_) {}),
          ref.read(activeOrdersProvider.future).then((_) {}),
        ]);
      },
      child: floorsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(message: '$error'),
        data: (floors) {
          return tablesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) => _ErrorState(message: '$error'),
            data: (tables) {
              // Active orders are best-effort here: if that call fails, tables just render
              // without the "order open" tint (falling back to their raw `status`) rather than
              // blocking the whole screen on a secondary signal.
              final activeOrders = activeOrdersAsync.asData?.value ?? const <Order>[];
              final tableIdsWithOrders = activeOrders
                  .where((o) => o.tableId != null)
                  .map((o) => o.tableId)
                  .toSet();
              // `activeOrdersProvider` already comes back oldest-first (backend's
              // `listActiveForOutlet` is `orderBy: { createdAt: 'asc' }`) — no client-side sort
              // needed, just filter to the type this section cares about.
              final activeTakeawayOrders = activeOrders.where((o) => o.type == 'TAKEAWAY').toList();

              final sortedFloors = [...floors]
                ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
              final effectiveFloorId = sortedFloors.any((f) => f.id == _selectedFloorId)
                  ? _selectedFloorId
                  : (sortedFloors.isNotEmpty ? sortedFloors.first.id : null);

              final visibleTables = effectiveFloorId == null
                  ? const <RestaurantTable>[]
                  : tables.where((t) => t.floorId == effectiveFloorId).toList();

              return Column(
                children: [
                  if (sortedFloors.length > 1)
                    SizedBox(
                      height: 48,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        children: [
                          for (final floor in sortedFloors)
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(floor.name),
                                selected: floor.id == effectiveFloorId,
                                onSelected: (_) => setState(() => _selectedFloorId = floor.id),
                              ),
                            ),
                        ],
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('Tables', style: Theme.of(context).textTheme.titleMedium),
                        ),
                        FilledButton.icon(
                          onPressed: () => _startTakeaway(context),
                          icon: const Icon(Icons.shopping_bag_outlined),
                          label: const Text('Takeaway'),
                        ),
                      ],
                    ),
                  ),
                  if (activeTakeawayOrders.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Active takeaway orders (${activeTakeawayOrders.length})',
                            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                              color: Theme.of(context).colorScheme.outline,
                            ),
                          ),
                          const SizedBox(height: 8),
                          for (final order in activeTakeawayOrders)
                            _TakeawayOrderTile(
                              order: order,
                              onTap: () => _openTakeawayOrder(context, order),
                            ),
                        ],
                      ),
                    ),
                  Expanded(
                    child: visibleTables.isEmpty
                        ? ListView(
                            // Wrapped in a scrollable so pull-to-refresh still works on an
                            // empty floor instead of doing nothing.
                            children: const [
                              Padding(
                                padding: EdgeInsets.all(32),
                                child: Center(child: Text('No tables on this floor yet.')),
                              ),
                            ],
                          )
                        : GridView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 160,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              childAspectRatio: 1.1,
                            ),
                            itemCount: visibleTables.length,
                            itemBuilder: (context, index) {
                              final table = visibleTables[index];
                              return TableTile(
                                table: table,
                                hasActiveOrder: tableIdsWithOrders.contains(table.id),
                                onTap: () => _openTable(context, table, activeOrders),
                              );
                            },
                          ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }

  void _openTable(BuildContext context, RestaurantTable table, List<Order> activeOrders) {
    // Deliberately a manual loop rather than `.firstWhere(..., orElse: ...)` returning a sentinel,
    // and rather than the `collection` package's `firstWhereOrNull` (not a declared dependency
    // here — see pubspec.yaml — so not guaranteed present even though it's often pulled in
    // transitively): this keeps the null-handling explicit with zero extra dependency risk.
    Order? existingOrder;
    for (final order in activeOrders) {
      if (order.tableId == table.id) {
        existingOrder = order;
        break;
      }
    }

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrderBuilderScreen(
          type: 'DINE_IN',
          tableId: table.id,
          tableName: table.name,
          existingOrder: existingOrder,
        ),
      ),
    );
  }

  void _startTakeaway(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => const OrderBuilderScreen(type: 'TAKEAWAY', tableId: null, tableName: null),
      ),
    );
  }

  void _openTakeawayOrder(BuildContext context, Order order) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => OrderBuilderScreen(
          type: 'TAKEAWAY',
          tableId: null,
          tableName: null,
          existingOrder: order,
        ),
      ),
    );
  }
}

/// One row in the "Active takeaway orders" list — deliberately plain (`Card`+`ListTile`) rather
/// than reusing `TableTile`'s grid-tile visuals, since a takeaway order has no capacity/floor
/// position to show and reads better as a list than a grid.
class _TakeawayOrderTile extends StatelessWidget {
  const _TakeawayOrderTile({required this.order, required this.onTap});

  final Order order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final activeItemCount = order.items.where((i) => !i.isCancelled).length;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.shopping_bag_outlined),
        title: Text(order.orderNumber),
        subtitle: Text(
          '${_statusLabel(order.status)} · $activeItemCount ${activeItemCount == 1 ? 'item' : 'items'}',
        ),
        trailing: Text(
          Money.parse(order.total).format(),
          style: Theme.of(context).textTheme.titleSmall,
        ),
        onTap: onTap,
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

class _ErrorState extends ConsumerWidget {
  const _ErrorState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {
                ref.invalidate(floorsProvider);
                ref.invalidate(tablesProvider);
                ref.invalidate(activeOrdersProvider);
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
