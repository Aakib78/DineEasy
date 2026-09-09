import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/menu_admin_models.dart';
import '../data/menu_admin_repository.dart';
import '../data/modifier_groups_repository.dart';
import '../data/tax_groups_repository.dart';

final menuAdminRepositoryProvider = Provider<MenuAdminRepository>(
  (ref) => MenuAdminRepository(ref.watch(apiClientProvider)),
);

final modifierGroupsRepositoryProvider = Provider<ModifierGroupsRepository>(
  (ref) => ModifierGroupsRepository(ref.watch(apiClientProvider)),
);

final taxGroupsRepositoryProvider = Provider<TaxGroupsRepository>(
  (ref) => TaxGroupsRepository(ref.watch(apiClientProvider)),
);

/// The full staff tree (categories → items → variants/modifier groups) — same endpoint the
/// order-builder cart reads (`GET /menu`), parsed into the richer admin model set instead. See
/// `menu_admin_models.dart`'s doc comment.
final menuTreeProvider = FutureProvider.autoDispose<List<MenuCategoryAdmin>>((ref) {
  return ref.watch(menuAdminRepositoryProvider).getFullTree();
});

final modifierGroupsListProvider = FutureProvider.autoDispose<List<ModifierGroupAdmin>>((ref) {
  return ref.watch(modifierGroupsRepositoryProvider).list();
});

final taxGroupsListProvider = FutureProvider.autoDispose<List<TaxGroup>>((ref) {
  return ref.watch(taxGroupsRepositoryProvider).list();
});

/// One item, fetched fresh — used by `ItemEditScreen` so it always reflects the latest
/// variant/modifier-group edits made from within that same screen (each of those calls
/// invalidates this) rather than the possibly-stale copy embedded in `menuTreeProvider`'s tree.
final itemDetailProvider = FutureProvider.autoDispose.family<MenuItemAdmin, String>((ref, id) {
  return ref.watch(menuAdminRepositoryProvider).getItem(id);
});
