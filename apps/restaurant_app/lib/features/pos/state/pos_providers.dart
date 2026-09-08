import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/menu_repository.dart';
import '../data/orders_repository.dart';
import '../data/pos_models.dart';
import '../data/tables_repository.dart';

final menuRepositoryProvider = Provider<MenuRepository>(
  (ref) => MenuRepository(ref.watch(apiClientProvider)),
);

final tablesRepositoryProvider = Provider<TablesRepository>(
  (ref) => TablesRepository(ref.watch(apiClientProvider)),
);

final ordersRepositoryProvider = Provider<OrdersRepository>(
  (ref) => OrdersRepository(ref.watch(apiClientProvider)),
);

/// `autoDispose` + `keepAlive` isn't used here on purpose: the POS screen wants a fresh menu
/// each time it's opened (an item going out of stock mid-shift is common), so this simply
/// re-fetches whenever the provider is re-watched from a fresh widget subtree. Pull-to-refresh
/// is exposed higher up via `ref.invalidate(menuProvider)`.
final menuProvider = FutureProvider.autoDispose<List<MenuCategory>>((ref) {
  return ref.watch(menuRepositoryProvider).getFullTree();
});

final tablesProvider = FutureProvider.autoDispose<List<RestaurantTable>>((ref) {
  return ref.watch(tablesRepositoryProvider).listTables();
});

final floorsProvider = FutureProvider.autoDispose<List<Floor>>((ref) {
  return ref.watch(tablesRepositoryProvider).listFloors();
});

/// Active orders for the outlet — used by the table grid to show "this table already has an
/// open order" instead of blindly offering to start a duplicate one (see OrderEntryScreen).
final activeOrdersProvider = FutureProvider.autoDispose<List<Order>>((ref) {
  return ref.watch(ordersRepositoryProvider).listActive();
});
