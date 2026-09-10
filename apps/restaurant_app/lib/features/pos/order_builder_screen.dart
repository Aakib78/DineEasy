import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/network/api_exception.dart';
import '../../core/rbac/permissions.dart';
import 'data/pos_models.dart';
import 'state/pos_cart.dart';
import 'state/pos_providers.dart';
import 'widgets/cart_panel.dart';
import 'widgets/item_customize_sheet.dart';
import 'widgets/menu_item_tile.dart';

/// Menu browsing + cart building for one table (or a takeaway slot). Two distinct submit
/// outcomes live behind one screen on purpose: starting a brand-new order (`POST /orders`) and
/// adding items to one already placed for this table (`POST /orders/:id/items`) are the same UX
/// from the staff member's point of view — "build a cart, send it to the kitchen" — even though
/// they're different backend calls. `existingOrder` (found by PosHomeScreen before navigating
/// here) is what decides which one this screen ends up calling.
class OrderBuilderScreen extends ConsumerStatefulWidget {
  const OrderBuilderScreen({
    super.key,
    required this.type,
    required this.tableId,
    required this.tableName,
    this.existingOrder,
  });

  /// 'DINE_IN' | 'TAKEAWAY' — see CreateStaffOrderDto on the backend.
  final String type;
  final String? tableId;
  final String? tableName;
  final Order? existingOrder;

  @override
  ConsumerState<OrderBuilderScreen> createState() => _OrderBuilderScreenState();
}

// Mirrors OrdersService.cancelItem's `itemsLockedFrom` guard: once a bill exists, line items
// are frozen even before payment, since the bill already reflects them.
const _itemCancelLocked = {
  OrderStatus.billed,
  OrderStatus.paid,
  OrderStatus.completed,
  OrderStatus.cancelled,
  OrderStatus.refunded,
};

// Mirrors the order-state-machine's CANCELLED transitions: reachable from every pre-payment
// status, never once PAID/COMPLETED (money has moved by then).
const _orderCancellable = {
  OrderStatus.draft,
  OrderStatus.placed,
  OrderStatus.accepted,
  OrderStatus.preparing,
  OrderStatus.ready,
  OrderStatus.served,
  OrderStatus.billed,
};

class _OrderBuilderScreenState extends ConsumerState<OrderBuilderScreen> {
  bool _submitting = false;
  String? _submitError;
  bool _serving = false;
  bool _accepting = false;
  String? _cancellingItemId;
  bool _cancellingOrder = false;
  bool _confirmingCancel = false;
  final _cancelReasonController = TextEditingController();

  // The order being continued/inspected — starts as whatever PosHomeScreen passed in, then
  // updated in place after accept/cancel-item so the banner reflects the mutation without a
  // full screen re-entry. `widget.existingOrder` itself never changes during this screen's life
  // (the caller doesn't rebuild it with fresh data), so this is the only source of truth here.
  Order? _order;

  @override
  void initState() {
    super.initState();
    _order = widget.existingOrder;
  }

  @override
  void dispose() {
    _cancelReasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final menuAsync = ref.watch(menuProvider);
    final continuingOrder = _order;
    final canUpdate = ref.watch(currentUserProvider)?.hasPermission(Permissions.ordersUpdate) ?? false;
    final canCancel = ref.watch(currentUserProvider)?.hasPermission(Permissions.ordersCancel) ?? false;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.type == 'TAKEAWAY'
              ? 'Takeaway order'
              : 'Table ${widget.tableName ?? ''}',
        ),
      ),
      body: Column(
        children: [
          if (continuingOrder != null)
            _ExistingOrderBanner(
              order: continuingOrder,
              // Only READY orders can be served (see order-state-machine.ts's READY ->
              // SERVED edge) — showing this for any other status would just 400.
              onMarkServed: continuingOrder.status == OrderStatus.ready && canUpdate && !_serving
                  ? () => _handleMarkServed(continuingOrder.id)
                  : null,
              isServing: _serving,
              // Only PLACED orders can be accepted — see OrdersService.acceptOrder's doc
              // comment: the kitchen already sees every PLACED order regardless, so this is
              // purely a front-of-house acknowledgment step.
              onAccept: continuingOrder.status == OrderStatus.placed && canUpdate && !_accepting
                  ? () => _handleAccept(continuingOrder.id)
                  : null,
              isAccepting: _accepting,
              canCancelItems: canCancel && !_itemCancelLocked.contains(continuingOrder.status),
              cancellingItemId: _cancellingItemId,
              onCancelItem: canCancel ? (itemId) => _handleCancelItem(continuingOrder.id, itemId) : null,
              canCancelOrder: canCancel && _orderCancellable.contains(continuingOrder.status),
              confirmingCancel: _confirmingCancel,
              cancellingOrder: _cancellingOrder,
              cancelReasonController: _cancelReasonController,
              onStartCancelOrder: () => setState(() => _confirmingCancel = true),
              onAbandonCancelOrder: () => setState(() {
                _confirmingCancel = false;
                _cancelReasonController.clear();
              }),
              onConfirmCancelOrder: () => _handleCancelOrder(continuingOrder.id),
            ),
          if (_submitError != null)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.errorContainer,
              padding: const EdgeInsets.all(12),
              child: Text(
                _submitError!,
                style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
              ),
            ),
          Expanded(
            child: menuAsync.when(
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
                        onPressed: () => ref.invalidate(menuProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
              data: (categories) => _MenuList(categories: categories),
            ),
          ),
          CartPanel(
            submitLabel: _submitting
                ? 'Sending…'
                : (continuingOrder != null ? 'Send to kitchen' : 'Place order'),
            onSubmit: _submitting ? () async {} : _handleSubmit,
          ),
        ],
      ),
    );
  }

  Future<void> _handleSubmit() async {
    final cart = ref.read(posCartProvider);
    if (cart.isEmpty) return;

    setState(() {
      _submitting = true;
      _submitError = null;
    });

    final ordersRepository = ref.read(ordersRepositoryProvider);
    final continuingOrder = _order;

    try {
      if (continuingOrder != null) {
        await ordersRepository.addItems(continuingOrder.id, cart);
      } else {
        await ordersRepository.createOrder(
          type: widget.type,
          tableId: widget.tableId,
          items: cart,
        );
      }

      ref.read(posCartProvider.notifier).clear();
      // The table grid and active-orders board both need to reflect the new/updated order —
      // simplest correct thing is to invalidate rather than try to patch either cache by hand.
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(tablesProvider);

      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitError = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// READY -> SERVED. Kitchen marking every item Done only gets the order to READY — it has no
  /// way to know when a waiter has actually carried the food to the table, so this is its own
  /// explicit action rather than something the kitchen screen triggers automatically. Until a
  /// staff member calls this, the order stays "open" on the table and Billing won't offer it
  /// (see billing_screen.dart's doc comment on what it expects).
  Future<void> _handleMarkServed(String orderId) async {
    setState(() => _serving = true);

    try {
      await ref.read(ordersRepositoryProvider).serve(orderId);
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(tablesProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Order marked served')),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _serving = false);
    }
  }

  /// See OrdersRepository.accept's doc comment — a front-of-house acknowledgment, not a kitchen
  /// gate, so staying on this screen afterward (rather than popping like Mark served does) is
  /// deliberate: accepting is usually the first step toward adding items, not the last action
  /// taken here.
  Future<void> _handleAccept(String orderId) async {
    setState(() => _accepting = true);

    try {
      final updated = await ref.read(ordersRepositoryProvider).accept(orderId);
      ref.invalidate(activeOrdersProvider);
      if (!mounted) return;
      setState(() => _order = updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }

  Future<void> _handleCancelItem(String orderId, String itemId) async {
    setState(() => _cancellingItemId = itemId);

    try {
      final updated = await ref.read(ordersRepositoryProvider).cancelItem(orderId, itemId);
      ref.invalidate(activeOrdersProvider);
      if (!mounted) return;
      setState(() => _order = updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _cancellingItemId = null);
    }
  }

  Future<void> _handleCancelOrder(String orderId) async {
    setState(() => _cancellingOrder = true);

    try {
      await ref.read(ordersRepositoryProvider).cancel(
        orderId,
        reason: _cancelReasonController.text.trim().isEmpty
            ? null
            : _cancelReasonController.text.trim(),
      );
      ref.read(posCartProvider.notifier).clear();
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(tablesProvider);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Order cancelled')),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      setState(() => _cancellingOrder = false);
    }
  }
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

class _ExistingOrderBanner extends StatelessWidget {
  const _ExistingOrderBanner({
    required this.order,
    required this.onMarkServed,
    required this.isServing,
    required this.onAccept,
    required this.isAccepting,
    required this.canCancelItems,
    required this.cancellingItemId,
    required this.onCancelItem,
    required this.canCancelOrder,
    required this.confirmingCancel,
    required this.cancellingOrder,
    required this.cancelReasonController,
    required this.onStartCancelOrder,
    required this.onAbandonCancelOrder,
    required this.onConfirmCancelOrder,
  });

  final Order order;
  /// Null when this order isn't eligible to be served right now (wrong status, no permission,
  /// or a serve call is already in flight) — hides the button rather than showing it disabled,
  /// since "why is this greyed out" isn't obvious to a busy waiter mid-shift.
  final VoidCallback? onMarkServed;
  final bool isServing;
  /// Same "hide, don't disable" reasoning as [onMarkServed] — null when not currently PLACED,
  /// lacking permission, or an accept call is already in flight.
  final VoidCallback? onAccept;
  final bool isAccepting;
  /// Whether the signed-in user may cancel a line item on this order right now (permission +
  /// not yet BILLED/settled) — gates the per-item Cancel action below.
  final bool canCancelItems;
  final String? cancellingItemId;
  final ValueChanged<String>? onCancelItem;
  /// Whether the whole order can still be voided (permission + a pre-payment status).
  final bool canCancelOrder;
  final bool confirmingCancel;
  final bool cancellingOrder;
  final TextEditingController cancelReasonController;
  final VoidCallback onStartCancelOrder;
  final VoidCallback onAbandonCancelOrder;
  final VoidCallback onConfirmCancelOrder;

  @override
  Widget build(BuildContext context) {
    final activeItems = order.items.where((i) => !i.isCancelled).toList();
    final onSecondary = Theme.of(context).colorScheme.onSecondaryContainer;
    return Container(
      width: double.infinity,
      color: Theme.of(context).colorScheme.secondaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.receipt_long, size: 18, color: onSecondary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Order #${order.orderNumber} — ${_statusLabel(order.status)} · '
                  '${activeItems.length} ${activeItems.length == 1 ? 'item' : 'items'} already sent',
                  style: TextStyle(color: onSecondary),
                ),
              ),
              if (onAccept != null || isAccepting) ...[
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: onAccept,
                  child: isAccepting
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Accept'),
                ),
              ],
              if (onMarkServed != null || isServing) ...[
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: onMarkServed,
                  child: isServing
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Mark served'),
                ),
              ],
            ],
          ),
          if (activeItems.isNotEmpty) ...[
            const SizedBox(height: 6),
            for (final item in activeItems)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${item.quantity}× ${item.nameSnapshot}'
                        '${item.variantNameSnapshot != null ? ' (${item.variantNameSnapshot})' : ''}',
                        style: TextStyle(color: onSecondary, fontSize: 13),
                      ),
                    ),
                    if (canCancelItems && onCancelItem != null)
                      cancellingItemId == item.id
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                          : TextButton(
                              style: TextButton.styleFrom(
                                minimumSize: Size.zero,
                                padding: const EdgeInsets.symmetric(horizontal: 6),
                              ),
                              onPressed: () => onCancelItem!(item.id),
                              child: Text('Cancel', style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
                            ),
                  ],
                ),
              ),
          ],
          if (canCancelOrder) ...[
            const SizedBox(height: 6),
            if (confirmingCancel) ...[
              TextField(
                controller: cancelReasonController,
                decoration: const InputDecoration(
                  labelText: 'Reason (optional)',
                  isDense: true,
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                "This voids the whole order — every item, sent or not. It can't be undone.",
                style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  FilledButton.tonal(
                    onPressed: cancellingOrder ? null : onConfirmCancelOrder,
                    child: cancellingOrder
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('Confirm cancel'),
                  ),
                  const SizedBox(width: 8),
                  TextButton(
                    onPressed: cancellingOrder ? null : onAbandonCancelOrder,
                    child: const Text('Never mind'),
                  ),
                ],
              ),
            ] else
              TextButton(
                onPressed: onStartCancelOrder,
                child: Text('Cancel this order', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
          ],
        ],
      ),
    );
  }
}

class _MenuList extends StatefulWidget {
  const _MenuList({required this.categories});

  final List<MenuCategory> categories;

  @override
  State<_MenuList> createState() => _MenuListState();
}

class _MenuListState extends State<_MenuList> with SingleTickerProviderStateMixin {
  TabController? _tabController;

  @override
  void initState() {
    super.initState();
    _syncController();
  }

  @override
  void didUpdateWidget(covariant _MenuList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.categories.length != widget.categories.length) {
      _syncController();
    }
  }

  void _syncController() {
    _tabController?.dispose();
    _tabController = TabController(length: widget.categories.length, vsync: this);
  }

  @override
  void dispose() {
    _tabController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.categories.isEmpty) {
      return const Center(child: Text('No menu items published for this outlet yet.'));
    }

    return Column(
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          child: TabBar(
            controller: _tabController,
            isScrollable: true,
            tabs: [for (final c in widget.categories) Tab(text: c.name)],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              for (final category in widget.categories)
                _CategoryItemList(items: category.items),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryItemList extends StatelessWidget {
  const _CategoryItemList({required this.items});

  final List<MenuItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(child: Text('No items in this category.'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = items[index];
        return MenuItemTile(
          item: item,
          onTap: () => ItemCustomizeSheet.show(context, item),
        );
      },
    );
  }
}
