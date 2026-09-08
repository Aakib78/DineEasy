import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/access_token_claims.dart';
import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import '../billing/billing_screen.dart';
import '../kitchen/kds_screen.dart';
import '../pos/pos_home_screen.dart';
import '../tables/tables_management_screen.dart';
import 'placeholder_screen.dart';

class _Destination {
  const _Destination({
    required this.label,
    required this.icon,
    required this.requiredPermission,
    required this.screen,
  });

  final String label;
  final IconData icon;

  /// Null means every signed-in staff member can see this destination (e.g. Settings, where
  /// the screen itself further gates individual actions). Otherwise the destination is hidden
  /// entirely unless the current user holds this permission — see the class doc comment in
  /// core/rbac/permissions.dart for why this is UX, not enforcement.
  final String? requiredPermission;

  final Widget screen;
}

final _destinations = <_Destination>[
  const _Destination(
    label: 'POS',
    icon: Icons.point_of_sale,
    requiredPermission: Permissions.ordersCreate,
    screen: PosHomeScreen(),
  ),
  const _Destination(
    label: 'Tables',
    icon: Icons.table_restaurant,
    requiredPermission: Permissions.tablesView,
    screen: TablesManagementScreen(),
  ),
  const _Destination(
    label: 'Kitchen',
    icon: Icons.soup_kitchen,
    requiredPermission: Permissions.kitchenView,
    screen: KdsScreen(),
  ),
  const _Destination(
    label: 'Billing',
    icon: Icons.receipt_long,
    requiredPermission: Permissions.billingView,
    screen: BillingScreen(),
  ),
  const _Destination(
    label: 'Reports',
    icon: Icons.bar_chart,
    requiredPermission: Permissions.reportsView,
    screen: PlaceholderScreen(title: 'Reports', icon: Icons.bar_chart),
  ),
  const _Destination(
    label: 'Staff',
    icon: Icons.people,
    requiredPermission: Permissions.staffView,
    screen: PlaceholderScreen(title: 'Staff', icon: Icons.people),
  ),
  const _Destination(
    label: 'Settings',
    icon: Icons.settings,
    requiredPermission: null,
    screen: PlaceholderScreen(title: 'Settings', icon: Icons.settings),
  ),
];

/// The signed-in staff member's home: a permission-filtered navigation shell around whichever
/// feature screens exist so far. POS/Tables/Kitchen/etc. are placeholders today — this shell is
/// the "Foundation + Auth" slice; each destination gets a real screen in its own later slice
/// (see docs/architecture.md §15), and nothing here needs to change when that happens beyond
/// swapping `screen:` for the real widget.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _selectedIndex = 0;

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

    // int.clamp returns num, not int — .toInt() keeps selectedIndex usable as a List index and
    // as NavigationRail/NavigationBar's selectedIndex (both require int).
    final selectedIndex = _selectedIndex.clamp(0, visible.length - 1).toInt();
    final isWide = MediaQuery.sizeOf(context).width >= 800;

    final body = visible.isEmpty
        ? const Center(child: Text('No screens available for your role yet.'))
        : visible[selectedIndex].screen;

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: visible.isEmpty ? 0 : selectedIndex,
              onDestinationSelected: (i) => setState(() => _selectedIndex = i),
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
      appBar: AppBar(title: Text(visible.isEmpty ? 'DineEasy' : visible[selectedIndex].label)),
      drawer: Drawer(child: _UserBadge(user: user, expanded: true)),
      body: body,
      bottomNavigationBar: visible.isEmpty
          ? null
          : NavigationBar(
              selectedIndex: selectedIndex,
              onDestinationSelected: (i) => setState(() => _selectedIndex = i),
              destinations: [
                for (final d in visible)
                  NavigationDestination(icon: Icon(d.icon), label: d.label),
              ],
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
