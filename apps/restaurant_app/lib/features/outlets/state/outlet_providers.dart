import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/outlet_models.dart';
import '../data/outlet_repository.dart';

final outletRepositoryProvider = Provider<OutletRepository>(
  (ref) => OutletRepository(ref.watch(apiClientProvider)),
);

/// The signed-in user's active outlet's own settings. `home_shell.dart` already refuses to
/// build any nav destination — this one included — while `activeOutletId` is null (see
/// `_NoOutletAssignedScreen`), so by the time `OutletSettingsScreen` can actually be reached the
/// claim is guaranteed non-null; the exception here is defensive only, matching how a null
/// `currentUser` is handled elsewhere in this app, not a state this provider expects to reach in
/// practice.
final outletProvider = FutureProvider.autoDispose<Outlet>((ref) {
  final outletId = ref.watch(currentUserProvider)?.activeOutletId;
  if (outletId == null) {
    throw StateError('No active outlet — this screen should be unreachable without one.');
  }
  return ref.watch(outletRepositoryProvider).getById(outletId);
});
