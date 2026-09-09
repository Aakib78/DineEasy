import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/money/money.dart';
import '../../core/realtime/realtime_providers.dart';
import '../pos/data/pos_models.dart';
import '../pos/state/pos_providers.dart';
import 'billing_detail_screen.dart';

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Two tabs: Incomplete (orders ready to bill or awaiting payment — `activeOrdersProvider`,
/// which already excludes COMPLETED/CANCELLED/REFUNDED) and Completed (`completedOrdersProvider`,
/// one calendar day at a time via a date picker, defaulting to today).
///
/// The Completed tab exists to close a real gap: once an order settles to COMPLETED it drops off
/// the Incomplete list, and until this existed there was no way back to its detail screen to
/// reprint the receipt if staff navigated away right after taking payment. See
/// `OrdersService.listCompletedForOutlet`'s doc comment and docs/printing.md. Mirrors
/// `apps/pos_web/src/features/billing/BillingScreen.tsx`.
class BillingScreen extends ConsumerStatefulWidget {
  const BillingScreen({super.key});

  @override
  ConsumerState<BillingScreen> createState() => _BillingScreenState();
}

enum _BillingTab { incomplete, completed }

class _BillingScreenState extends ConsumerState<BillingScreen> {
  _BillingTab _tab = _BillingTab.incomplete;
  DateTime _completedDate = _dateOnly(DateTime.now());

  StreamSubscription<void>? _orderRealtimeSub;

  @override
  void initState() {
    super.initState();
    // This board used to only ever refresh on pull-to-refresh or navigating back from a detail
    // screen — a split payment recorded on a different tablet, or the kitchen/waiter path
    // getting an order to SERVED, wouldn't show up here until someone happened to pull down.
    // `order.updated` covers both now (`PaymentsService.recordPayment` emits it for every
    // payment, not just ones that fully settle the order — see its doc comment — so a partial
    // payment recorded elsewhere updates "paid so far" here live too). Only re-checks Completed
    // when today is the selected day — an order settling elsewhere can't affect a past day's
    // already-fixed list.
    _orderRealtimeSub = ref.read(realtimeServiceProvider).orderUpdated.listen((_) {
      if (!mounted) return;
      ref.invalidate(activeOrdersProvider);
      if (_completedDate == _dateOnly(DateTime.now())) {
        ref.invalidate(completedOrdersProvider(_completedDate));
      }
    });
  }

  @override
  void dispose() {
    _orderRealtimeSub?.cancel();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _completedDate,
      firstDate: DateTime(2020),
      lastDate: _dateOnly(DateTime.now()),
    );
    if (picked != null && mounted) setState(() => _completedDate = _dateOnly(picked));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: SegmentedButton<_BillingTab>(
              segments: const [
                ButtonSegment(value: _BillingTab.incomplete, label: Text('Incomplete')),
                ButtonSegment(value: _BillingTab.completed, label: Text('Completed')),
              ],
              selected: {_tab},
              onSelectionChanged: (s) => setState(() => _tab = s.first),
            ),
          ),
          Expanded(
            child: _tab == _BillingTab.incomplete
                ? const _IncompleteTab()
                : _CompletedTab(date: _completedDate, onPickDate: _pickDate),
          ),
        ],
      ),
    );
  }
}

class _IncompleteTab extends ConsumerWidget {
  const _IncompleteTab();

  static const _billableStatuses = {OrderStatus.served, OrderStatus.billed, OrderStatus.paid};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(activeOrdersProvider);

    return RefreshIndicator(
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
            itemBuilder: (context, index) => _OrderTile(order: billable[index]),
          );
        },
      ),
    );
  }
}

class _CompletedTab extends ConsumerWidget {
  const _CompletedTab({required this.date, required this.onPickDate});

  final DateTime date;
  final VoidCallback onPickDate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final completedAsync = ref.watch(completedOrdersProvider(date));
    final isToday = date == _dateOnly(DateTime.now());

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(completedOrdersProvider(date));
        await ref.read(completedOrdersProvider(date).future);
      },
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.calendar_today_outlined),
            title: Text(
              isToday ? 'Today (${DateFormat.yMMMd().format(date)})' : DateFormat.yMMMd().format(date),
            ),
            trailing: const Icon(Icons.edit_outlined),
            onTap: onPickDate,
          ),
          const SizedBox(height: 4),
          completedAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (error, _) => Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('$error', textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () => ref.invalidate(completedOrdersProvider(date)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
            data: (orders) => orders.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        'No completed orders on this date.',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  )
                // mainAxisSize.min is required here, not cosmetic — this Column sits inside a
                // ListView's children list, which hands its children unbounded height; the
                // default mainAxisSize.max would try to fill that and throw a layout error.
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (final order in orders) ...[
                        _OrderTile(order: order),
                        const SizedBox(height: 8),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order});

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
