import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/notification_models.dart';
import 'state/notifications_providers.dart';

/// The in-app notification inbox (spec's "bell icon" step ahead of any real push/OS
/// notification — see `docs/flutter-app.md`). Every signed-in staff member has one; unlike
/// every other feature screen there's no RBAC gating here at all, matching the backend
/// controller's own "authenticated-only" contract (`NotificationsController`'s doc comment) —
/// `NotificationsService`'s visibility filter is what actually decides which rows a given user
/// gets back, not anything client-side.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _markAllRead(WidgetRef ref) async {
    await ref.read(notificationsRepositoryProvider).markAllRead();
    ref.invalidate(notificationsListProvider);
    ref.invalidate(unreadNotificationCountProvider);
  }

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(notificationsListProvider);
    ref.invalidate(unreadNotificationCountProvider);
    await ref.read(notificationsListProvider.future);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadOnly = ref.watch(notificationsUnreadOnlyProvider);
    final notificationsAsync = ref.watch(notificationsListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            tooltip: 'Mark all as read',
            icon: const Icon(Icons.done_all),
            onPressed: () => _markAllRead(ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('All')),
                  ButtonSegment(value: true, label: Text('Unread')),
                ],
                selected: {unreadOnly},
                onSelectionChanged: (selection) =>
                    ref.read(notificationsUnreadOnlyProvider.notifier).state = selection.first,
              ),
            ),
            Expanded(
              child: notificationsAsync.when(
                data: (items) {
                  if (items.isEmpty) {
                    return ListView(
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 48),
                          child: Center(
                            child: Text(unreadOnly ? "You're all caught up." : 'No notifications yet.'),
                          ),
                        ),
                      ],
                    );
                  }
                  return ListView.separated(
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (context, index) =>
                        _NotificationTile(notification: items[index]),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) =>
                    _ErrorState(message: '$error', onRetry: () => ref.invalidate(notificationsListProvider)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  IconData get _icon => switch (notification.type) {
    'ORDER_READY' => Icons.restaurant,
    _ => Icons.notifications,
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = notification.isUnread;
    return ListTile(
      leading: CircleAvatar(child: Icon(_icon)),
      title: Text(
        notification.title,
        style: TextStyle(fontWeight: unread ? FontWeight.bold : FontWeight.normal),
      ),
      subtitle: Text(notification.body),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(_relativeTime(notification.createdAt), style: Theme.of(context).textTheme.bodySmall),
          if (unread) ...[
            const SizedBox(height: 4),
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                shape: BoxShape.circle,
              ),
            ),
          ],
        ],
      ),
      onTap: unread
          ? () async {
              // Optimistic-enough: the tap already reads as "acknowledged" the moment it
              // happens, so there's no local-state flip while this is in flight — a failed
              // request just leaves it unread and the next poll/pull-to-refresh reflects that.
              await ref.read(notificationsRepositoryProvider).markRead(notification.id);
              ref.invalidate(notificationsListProvider);
              ref.invalidate(unreadNotificationCountProvider);
            }
          : null,
    );
  }
}

/// Same shape as every other feature screen's `_ErrorState` (see e.g. `staff_screen.dart`) —
/// duplicated rather than shared, same reasoning as that file's `_SheetShell` doc comment: this
/// app has no `lib/core/widgets/` yet and it's a handful of lines.
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 40, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}

/// Coarse, human-scale relative time (no third-party `timeago` dependency for one string) —
/// same inlined-per-screen approach as `kds_screen.dart`'s elapsed-time helper rather than a
/// shared utility for a handful of call sites.
String _relativeTime(DateTime time) {
  final elapsed = DateTime.now().difference(time);
  if (elapsed.inMinutes < 1) return 'just now';
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes}m ago';
  if (elapsed.inHours < 24) return '${elapsed.inHours}h ago';
  return '${elapsed.inDays}d ago';
}
