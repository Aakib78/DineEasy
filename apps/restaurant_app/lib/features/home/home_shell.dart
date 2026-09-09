import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/access_token_claims.dart';
import '../../core/auth/auth_session.dart';
import '../../core/config/app_config.dart';
import '../../core/rbac/permissions.dart';
import '../../core/realtime/realtime_providers.dart';
import '../billing/billing_screen.dart';
import '../kitchen/kds_screen.dart';
import '../notifications/notifications_screen.dart';
import '../notifications/state/notifications_providers.dart';
import '../pos/pos_home_screen.dart';
import '../reports/reports_screen.dart';
import '../settings/settings_screen.dart';
import '../staff/staff_screen.dart';
import '../tables/tables_management_screen.dart';

class _Destination {
  const _Destination({
    required this.label,
    required this.icon,
    required this.requiredPermission,
    required this.screen,
    required this.inBottomNav,
  });

  final String label;
  final IconData icon;

  /// Null means every signed-in staff member can see this destination (e.g. Settings, where
  /// the screen itself further gates individual actions). Otherwise the destination is hidden
  /// entirely unless the current user holds this permission — see the class doc comment in
  /// core/rbac/permissions.dart for why this is UX, not enforcement.
  final String? requiredPermission;

  final Widget screen;

  /// True for the handful of destinations staff tap between constantly during a shift (POS,
  /// Kitchen, Billing) — these are what actually occupy the bottom nav bar / rail as
  /// always-visible tabs. The rest (Tables, Reports, Staff, Settings) are lower-frequency
  /// lookup/admin destinations that don't need to permanently claim bottom-nav space on a phone
  /// screen — they live in the drawer instead, opened from the AppBar's menu icon (see
  /// `_HomeShellState.build`'s narrow-layout branch). On a wide/tablet layout the
  /// `NavigationRail` still lists every destination together, primary and secondary alike,
  /// since a rail is already a sidebar rather than a bottom nav — nothing to move there.
  final bool inBottomNav;
}

final _destinations = <_Destination>[
  const _Destination(
    label: 'POS',
    icon: Icons.point_of_sale,
    requiredPermission: Permissions.ordersCreate,
    screen: PosHomeScreen(),
    inBottomNav: true,
  ),
  const _Destination(
    label: 'Kitchen',
    icon: Icons.soup_kitchen,
    requiredPermission: Permissions.kitchenView,
    screen: KdsScreen(),
    inBottomNav: true,
  ),
  const _Destination(
    label: 'Billing',
    icon: Icons.receipt_long,
    requiredPermission: Permissions.billingView,
    screen: BillingScreen(),
    inBottomNav: true,
  ),
  const _Destination(
    label: 'Tables',
    icon: Icons.table_restaurant,
    requiredPermission: Permissions.tablesView,
    screen: TablesManagementScreen(),
    inBottomNav: false,
  ),
  const _Destination(
    label: 'Reports',
    icon: Icons.bar_chart,
    requiredPermission: Permissions.reportsView,
    screen: ReportsScreen(),
    inBottomNav: false,
  ),
  const _Destination(
    label: 'Staff',
    icon: Icons.people,
    requiredPermission: Permissions.staffView,
    screen: StaffScreen(),
    inBottomNav: false,
  ),
  const _Destination(
    label: 'Settings',
    icon: Icons.settings,
    requiredPermission: null,
    screen: SettingsScreen(),
    inBottomNav: false,
  ),
];

/// The signed-in staff member's home: a permission-filtered navigation shell around whichever
/// feature screens exist so far. Every destination above now has a real screen — Settings was
/// the last placeholder (see docs/architecture.md §15) until its Printers entry landed; this
/// shell itself needed no change for that beyond swapping `screen:` for the real widget, which
/// is the whole point of keeping `_destinations` as plain data. On a narrow/phone layout, only
/// `inBottomNav` destinations (POS, Kitchen, Billing) occupy the bottom nav bar — the rest move
/// to the drawer, opened from the AppBar's menu icon — see `_Destination.inBottomNav`'s doc
/// comment for why.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  /// Index into `primaryVisible` (POS/Kitchen/Billing, filtered by permission) — only changes
  /// when a bottom-nav / rail primary tab is tapped, never by viewing a drawer destination. See
  /// `_secondaryOverride`'s doc comment for why these are tracked separately.
  int _selectedPrimaryIndex = 0;

  /// Non-null while a drawer (or, on a wide layout, rail) destination outside the primary three
  /// — Tables, Reports, Staff, Settings — is what's showing. Kept separate from
  /// `_selectedPrimaryIndex` so that opening one of these doesn't disturb which primary tab the
  /// bottom nav highlights underneath it, the same way opening a drawer item in most apps
  /// doesn't "steal" the tab bar's selection. Cleared the moment a primary tab is tapped again.
  /// Holds a reference into the static `_destinations` list (stable `const` instances), so
  /// straightforward identity equality is enough to compare/validate it — no id/label lookup
  /// needed.
  _Destination? _secondaryOverride;

  Timer? _notificationPollTimer;
  StreamSubscription<void>? _notificationRealtimeSub;

  @override
  void initState() {
    super.initState();
    // The bell badge has two independent ways of staying current, deliberately layered rather
    // than either alone: a `notification.created` nudge from RealtimeGateway (near-instant,
    // see core/realtime/realtime_service.dart) plus this poll as a backstop for whenever the
    // socket hasn't connected yet or ever (captive portal, a proxy blocking WebSocket upgrades).
    // 20s is generous specifically because the realtime path is expected to be doing the real
    // work most of the time now — see `unreadNotificationCountProvider`'s doc comment.
    _notificationPollTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      if (mounted) ref.invalidate(unreadNotificationCountProvider);
    });

    // HomeShell is only ever mounted once the router has redirected an authenticated user here
    // (see app_router.dart) and unmounted the moment that stops being true, so its init/dispose
    // is exactly the right lifecycle to open/close the one shared realtime socket for this
    // session — individual feature screens (POS, Kitchen) just subscribe to it, never manage
    // its connection themselves.
    unawaited(_connectRealtime());
    _notificationRealtimeSub = ref.read(realtimeServiceProvider).notificationCreated.listen((_) {
      if (mounted) ref.invalidate(unreadNotificationCountProvider);
    });
  }

  Future<void> _connectRealtime() async {
    final tokens = await ref.read(tokenStorageProvider).read();
    if (tokens == null || !mounted) return;
    ref
        .read(realtimeServiceProvider)
        .connect(apiBaseUrl: AppConfig.apiBaseUrl, accessToken: tokens.accessToken);
  }

  @override
  void dispose() {
    _notificationPollTimer?.cancel();
    _notificationRealtimeSub?.cancel();
    // An authenticated socket must not outlive the session that opened it — HomeShell unmounting
    // means the router has already decided the user is signed out (see the class doc comment
    // above), so this is the right moment to close it rather than waiting on garbage collection.
    ref.read(realtimeServiceProvider).disconnect();
    super.dispose();
  }

  void _selectPrimary(int index) {
    setState(() {
      _selectedPrimaryIndex = index;
      _secondaryOverride = null;
    });
  }

  void _selectSecondary(_Destination destination) {
    setState(() => _secondaryOverride = destination);
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    if (user == null) {
      // Shouldn't happen — the router only routes here when authenticated — but fail safe
      // with a blank scaffold rather than crashing on a null claims access below.
      return const Scaffold(body: SizedBox.shrink());
    }

    final visible = _destinations
        .where((d) => d.requiredPermission == null || user.hasPermission(d.requiredPermission!))
        .toList();

    if (user.activeOutletId == null) {
      return _NoOutletAssignedScreen(user: user);
    }

    final primaryVisible = visible.where((d) => d.inBottomNav).toList();
    final secondaryVisible = visible.where((d) => !d.inBottomNav).toList();

    // int.clamp returns num, not int — .toInt() keeps this usable as a List index and as
    // NavigationRail/NavigationBar's selectedIndex (both require int).
    final selectedPrimaryIndex = primaryVisible.isEmpty
        ? 0
        : _selectedPrimaryIndex.clamp(0, primaryVisible.length - 1).toInt();

    // Only honor a pending override if it's still actually visible — a stale reference here
    // (the current user's role/permissions changed mid-session, however unlikely) must never be
    // trusted over what they can currently see.
    final override =
        _secondaryOverride != null && visible.contains(_secondaryOverride) ? _secondaryOverride : null;

    final current = override ??
        (primaryVisible.isNotEmpty
            ? primaryVisible[selectedPrimaryIndex]
            : (secondaryVisible.isNotEmpty ? secondaryVisible.first : null));

    final isWide = MediaQuery.sizeOf(context).width >= 800;

    final body = current == null
        ? const Center(child: Text('No screens available for your role yet.'))
        : current.screen;

    if (isWide) {
      final railIndex = current == null ? 0 : visible.indexOf(current);
      return Scaffold(
        appBar: AppBar(
          title: Text(current?.label ?? 'DineEasy'),
          actions: const [_NotificationBellButton()],
        ),
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: visible.isEmpty ? 0 : railIndex,
              onDestinationSelected: (i) {
                final destination = visible[i];
                if (destination.inBottomNav) {
                  _selectPrimary(primaryVisible.indexOf(destination));
                } else {
                  _selectSecondary(destination);
                }
              },
              labelType: NavigationRailLabelType.all,
              leading: _UserBadge(user: user),
              destinations: [
                for (final d in visible)
                  NavigationRailDestination(icon: Icon(d.icon), label: Text(d.label)),
              ],
            ),
            const VerticalDivider(width: 1),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(current?.label ?? 'DineEasy'),
        actions: const [_NotificationBellButton()],
      ),
      // Tables/Reports/Staff/Settings live here rather than in the bottom nav — see
      // `_Destination.inBottomNav`'s doc comment. `Scaffold` shows the AppBar's menu icon
      // automatically whenever `drawer` is set, so there's nothing else to wire up to open it.
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            children: [
              _UserBadge(user: user, expanded: true),
              if (secondaryVisible.isNotEmpty) ...[
                const Divider(height: 1),
                for (final d in secondaryVisible)
                  ListTile(
                    leading: Icon(d.icon),
                    title: Text(d.label),
                    selected: identical(current, d),
                    onTap: () {
                      Navigator.of(context).pop();
                      _selectSecondary(d);
                    },
                  ),
              ],
            ],
          ),
        ),
      ),
      body: body,
      bottomNavigationBar: primaryVisible.isEmpty
          ? null
          : NavigationBar(
              selectedIndex: selectedPrimaryIndex,
              onDestinationSelected: _selectPrimary,
              destinations: [
                for (final d in primaryVisible)
                  NavigationDestination(icon: Icon(d.icon), label: d.label),
              ],
            ),
    );
  }
}

/// Lives in the shell's `AppBar` rather than as a nav destination — an inbox you glance at and
/// dismiss, not a whole tab, and (per `NotificationsController`'s doc comment) it's the one
/// piece of the app every signed-in staff member sees regardless of role, so it doesn't belong
/// in the permission-filtered `_destinations` list above at all.
class _NotificationBellButton extends ConsumerWidget {
  const _NotificationBellButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countAsync = ref.watch(unreadNotificationCountProvider);
    final count = countAsync.asData?.value ?? 0;

    return Badge(
      label: Text('$count'),
      isLabelVisible: count > 0,
      child: IconButton(
        tooltip: 'Notifications',
        icon: const Icon(Icons.notifications_outlined),
        onPressed: () async {
          await Navigator.of(context).push<void>(
            MaterialPageRoute(builder: (_) => const NotificationsScreen()),
          );
          // The inbox screen marks things read on tap and via "mark all read" without this
          // shell knowing when — re-check the badge the moment the user comes back to it
          // rather than waiting for the next 20s poll tick.
          ref.invalidate(unreadNotificationCountProvider);
        },
      ),
    );
  }
}

class _UserBadge extends ConsumerWidget {
  const _UserBadge({required this.user, this.expanded = false});

  final AccessTokenClaims user;
  final bool expanded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(child: Text(user.name.isNotEmpty ? user.name[0].toUpperCase() : '?')),
          if (expanded) ...[
            const SizedBox(height: 8),
            Text(user.name, style: Theme.of(context).textTheme.titleMedium),
            Text(user.email, style: Theme.of(context).textTheme.bodySmall),
          ],
          const SizedBox(height: 8),
          IconButton(
            tooltip: 'Sign out',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authSessionProvider.notifier).logout(),
          ),
        ],
      ),
    );
  }
}

class _NoOutletAssignedScreen extends ConsumerWidget {
  const _NoOutletAssignedScreen({required this.user});

  final AccessTokenClaims user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.storefront_outlined, size: 48),
              const SizedBox(height: 16),
              Text(
                "You're not assigned to an outlet yet",
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Ask your manager or the account owner to assign ${user.name} to an outlet, '
                'then sign in again.',
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: () => ref.read(authSessionProvider.notifier).logout(),
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
