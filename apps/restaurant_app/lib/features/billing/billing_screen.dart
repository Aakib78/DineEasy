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
    // payment recorded elsewhere updates "paid so far" here live too).
    _orderRealtimeSub = ref.read(realtimeServiceProvider).orderUpdated.listen((_) {
      if (mounted) ref.invalidate(activeOrdersProvider);
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

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(activeOrdersProvider);
          await ref.read(activeOrdersProvider.future);
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

            if (billable.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        'No orders waiting to be billed.',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ),
                ],
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: billable.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) => _BillableOrderTile(order: billable[index]),
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
