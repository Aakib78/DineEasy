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

/// Active-only — used by `ItemEditScreen`'s modifier-group picker, where an inactive group
/// shouldn't be offered as a new attachment (an already-attached-but-now-inactive one is still
/// shown there, via a separate union computed client-side — see `_ModifierGroupPicker`).
final modifierGroupsListProvider = FutureProvider.autoDispose<List<ModifierGroupAdmin>>((ref) {
  return ref.watch(modifierGroupsRepositoryProvider).list();
});

/// Active-only — used by `ItemEditScreen`'s tax-group dropdown, where (unlike the modifier-group
/// picker above) there's no extra filter keeping an inactive one from being newly assignable, so
/// the exclusion has to happen here instead.
final taxGroupsListProvider = FutureProvider.autoDispose<List<TaxGroup>>((ref) {
  return ref.watch(taxGroupsRepositoryProvider).list();
});

/// Active + inactive — backs the standalone `ModifierGroupsScreen`, distinct from
/// [modifierGroupsListProvider] above so deactivating a group there doesn't make it vanish from
/// the one screen that could reactivate it.
final modifierGroupsAdminProvider = FutureProvider.autoDispose<List<ModifierGroupAdmin>>((ref) {
  return ref.watch(modifierGroupsRepositoryProvider).list(includeInactive: true);
});

/// Active + inactive — same reasoning as [modifierGroupsAdminProvider], backing `TaxGroupsScreen`.
final taxGroupsAdminProvider = FutureProvider.autoDispose<List<TaxGroup>>((ref) {
  return ref.watch(taxGroupsRepositoryProvider).list(includeInactive: true);
});

/// One item, fetched fresh — used by `ItemEditScreen` so it always reflects the latest
/// variant/modifier-group edits made from within that same screen (each of those calls
/// invalidates this) rather than the possibly-stale copy embedded in `menuTreeProvider`'s tree.
final itemDetailProvider = FutureProvider.autoDispose.family<MenuItemAdmin, String>((ref, id) {
  return ref.watch(menuAdminRepositoryProvider).getItem(id);
});
