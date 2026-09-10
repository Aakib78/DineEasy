import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/dining_session_models.dart';
import '../data/dining_sessions_repository.dart';

final diningSessionsRepositoryProvider = Provider<DiningSessionsRepository>(
  (ref) => DiningSessionsRepository(ref.watch(apiClientProvider)),
);

/// Every currently-OPEN session at the active outlet. `TablesManagementScreen` watches this
/// once and looks sessions up by `tableId` client-side, rather than each table tile fetching
/// its own — a floor plan with, say, 30 tables would otherwise fire 30 separate requests.
final openDiningSessionsProvider = FutureProvider.autoDispose<List<DiningSession>>((ref) {
  return ref.watch(diningSessionsRepositoryProvider).listOpen();
});

/// One session's full detail (including item-level order history), keyed by session id — used
/// by `DiningSessionDetailScreen`, fetched fresh rather than reused from [openDiningSessionsProvider]
/// since the list endpoint doesn't include order items.
final diningSessionDetailProvider = FutureProvider.autoDispose.family<DiningSession, String>((
  ref,
  sessionId,
) {
  return ref.watch(diningSessionsRepositoryProvider).getById(sessionId);
});
