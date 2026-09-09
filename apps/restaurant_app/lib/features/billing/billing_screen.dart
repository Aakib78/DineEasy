import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/money/money.dart';
import '../../core/realtime/realtime_providers.dart';
import '../pos/data/pos_models.dart';
import '../pos/state/pos_providers.dart';
import 'billing_detail_screen.dart';

/// Orders ready to bill (SERVED, awaiting `POST /orders/:id/invoice`) or already billed and
/// awaiting payment (BILLED, or the brief in-flight PAID moment before the backend's
/// `settleOrder` finishes advancing it to COMPLETED — see `PaymentsService`). Reuses
/// `activeOrdersProvider` (`lib/features/pos/state/pos_providers.dart`) rather than a separate
/// endpoint — `GET /orders` already excludes COMPLETED/CANCELLED/REFUNDED, so filtering
/// client-side to these three statuses is enough; there's no dedicated "orders to bill"
/// endpoint on the backend.
///
/// Also shows today's already-COMPLETED orders below the active list
/// (`completedOrdersProvider` → `GET /orders/completed`) — closes a real gap: once an order
/// settles to COMPLETED it drops off the active list above, and until this existed there was no
/// way back to its detail screen to reprint the receipt if staff navigated away right after
/// taking payment. See `OrdersService.listCompletedForOutlet`'s doc comment and
/// docs/printing.md.
class BillingScreen extends ConsumerStatefulWidget {
  const BillingScreen({super.key});

  @override
  ConsumerState<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends ConsumerState<BillingScreen> {
  static const _billableStatuses = {OrderStatus.served, OrderStatus.billed, OrderStatus.paid};

  StreamSubscription<void>? _orderRealtimeSub;

  @override
  void initState() {
    super.initState();
    // This board used to only ever refresh on pull-to-refresh or navigating back from a detail
    // screen — a split payment recorded on a different tablet, or the kitchen/waiter path
    // getting an order to SERVED, wouldn't show up here until someone happened to pull down.
    // `order.updated` covers both now (`PaymentsService.recordPayment` emits it for every
    // payment, not just ones that fully settle the order — see its doc comment — so a partial
    // payment recorded elsewhere updates "paid so far" here live too). Also covers an order
    // settling to COMPLETED elsewhere, which is what moves it into "Recently completed" below.
    _orderRealtimeSub = ref.read(realtimeServiceProvider).orderUpdated.listen((_) {
      if (mounted) {
        ref.invalidate(activeOrdersProvider);
        ref.invalidate(completedOrdersProvider);
      }
    });
  }

  @override
  void dispose() {
    _orderRealtimeSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(activeOrdersProvider);
    final completedAsync = ref.watch(completedOrdersProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(activeOrdersProvider);
          ref.invalidate(completedOrdersProvider);
          await Future.wait<void>([
            ref.read(activeOrdersProvider.future).then((_) {}),
            ref.read(completedOrdersProvider.future).then((_) {}),
          ]);
        },
        child: ordersAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$error', textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => ref.invalidate(activeOrdersProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ],
          ),
          data: (orders) {
            final billable = orders.where((o) => _billableStatuses.contains(o.status)).toList();
            // Completed orders load independently — a slow/failed fetch there shouldn't block
            // the active board from rendering, so this only ever adds a section, never an error
            // state of its own (silently empty on failure is the right degrade here).
            final completed = completedAsync.asData?.value ?? const <Order>[];

            return ListView(
              padding: const EdgeInsets.all(12),
              children: [
                if (billable.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        'No orders waiting to be billed.',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  )
                else
                  for (final order in billable) ...[
                    _BillableOrderTile(order: order),
                    const SizedBox(height: 8),
                  ],
                if (completed.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Recently completed', style: Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 2),
                        Text(
                          'Fully paid, today. Open one to reprint its receipt.',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).colorScheme.outline,
                              ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  for (final order in completed) ...[
                    _BillableOrderTile(order: order),
                    const SizedBox(height: 8),
                  ],
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BillableOrderTile extends StatelessWidget {
  const _BillableOrderTile({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final paidSoFar = order.payments
        .where((p) => p.isSucceeded)
        .fold(Money.zero, (sum, p) => sum + Money.parse(p.amount));
    final remaining = Money.parse(order.total) - paidSoFar;

    final (label, color) = switch (order.status) {
      OrderStatus.served => ('Ready to bill', Colors.blue.shade700),
      OrderStatus.billed when remaining <= Money.zero => ('Fully paid', Colors.green.shade700),
      OrderStatus.billed => ('Awaiting payment', Colors.orange.shade700),
      OrderStatus.paid => ('Settling…', Colors.green.shade700),
      OrderStatus.completed => ('Completed', Colors.green.shade700),
      _ => ('', Colors.grey),
    };

    return Card(
      child: ListTile(
        title: Text(
          order.tableName != null ? '${order.tableName} · ${order.orderNumber}' : 'Takeaway · ${order.orderNumber}',
        ),
        subtitle: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
        trailing: Text(
          Money.parse(order.total).format(),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => BillingDetailScreen(orderId: order.id)),
        ),
      ),
    );
  }
}
