import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
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

class _OrderBuilderScreenState extends ConsumerState<OrderBuilderScreen> {
  bool _submitting = false;
  String? _submitError;

  @override
  Widget build(BuildContext context) {
    final menuAsync = ref.watch(menuProvider);
    final continuingOrder = widget.existingOrder;

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
          if (continuingOrder != null) _ExistingOrderBanner(order: continuingOrder),
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
    final continuingOrder = widget.existingOrder;

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
}

class _ExistingOrderBanner extends StatelessWidget {
  const _ExistingOrderBanner({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final activeItems = order.items.where((i) => !i.isCancelled).toList();
    return Container(
      width: double.infinity,
      color: Theme.of(context).colorScheme.secondaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Icon(Icons.receipt_long, size: 18, color: Theme.of(context).colorScheme.onSecondaryContainer),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Adding to order #${order.orderNumber} — ${activeItems.length} '
              '${activeItems.length == 1 ? 'item' : 'items'} already sent',
              style: TextStyle(color: Theme.of(context).colorScheme.onSecondaryContainer),
            ),
          ),
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
