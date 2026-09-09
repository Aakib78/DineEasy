import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_session.dart';
import '../data/notifications_repository.dart';

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(apiClientProvider)),
);

/// The bell icon's badge and `NotificationsScreen`'s list both watch this. `HomeShell` keeps it
/// current two ways layered together, same shape as `kitchen_providers.dart`'s `kdsQueueProvider`
/// (see that file's doc comment): a near-instant nudge from `RealtimeGateway`'s
/// `notification.created` event, plus an unconditional `Timer.periodic` backstop. 20s rather
/// than KDS's 6s: an unread count is far less time-critical than a live kitchen board, and this
/// poll runs continuously in the background across every tab, not just while one particular
/// screen is open — it only exists at all for whenever the realtime path hasn't connected.
final unreadNotificationCountProvider = FutureProvider.autoDispose<int>((ref) {
  return ref.watch(notificationsRepositoryProvider).unreadCount();
});

/// `false` (the default) shows every notification, most recent first, same as opening the
/// inbox normally; `true` is the "just show what still needs attention" filter.
final notificationsUnreadOnlyProvider = StateProvider.autoDispose<bool>((ref) => false);

final notificationsListProvider = FutureProvider.autoDispose((ref) {
  final unreadOnly = ref.watch(notificationsUnreadOnlyProvider);
  return ref.watch(notificationsRepositoryProvider).list(unreadOnly: unreadOnly);
});
