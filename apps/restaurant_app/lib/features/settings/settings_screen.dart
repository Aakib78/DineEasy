import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import '../audit/audit_log_screen.dart';
import '../menu_management/menu_management_screen.dart';
import '../printers/printers_screen.dart';

/// Replaces the old `PlaceholderScreen(title: 'Settings', ...)` in `home_shell.dart` — see
/// docs/architecture.md §15: "printer setup is a real, recurring operational need... it only
/// exists in apps/pos_web today. Porting an equivalent Printers screen into the Flutter app's
/// Settings destination is open." This is that port. Every signed-in staff member can see this
/// destination (it's `requiredPermission: null` in `home_shell.dart`, same as Settings always
/// was) — individual entries below are what gate on a real permission, same UX-only pattern as
/// every other screen in this app (`core/rbac/permissions.dart`'s doc comment).
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final canManagePrinters = user?.hasPermission(Permissions.printersManage) ?? false;
    final canViewMenu = user?.hasPermission(Permissions.menuView) ?? false;
    final canViewAudit = user?.hasPermission(Permissions.auditView) ?? false;

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        if (user != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  child: Text(user.name.isNotEmpty ? user.name[0].toUpperCase() : '?'),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.name, style: Theme.of(context).textTheme.titleMedium),
                      Text(user.email, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
          ),
        const Divider(height: 1),
        // Categories/items/variants/modifier-groups/tax-groups — full backend CRUD existed with
        // no UI consumer until now (see docs/pos-web.md's "What's explicitly not built": this is
        // Flutter-only in v1, deliberately not ported to apps/pos_web).
        if (canViewMenu)
          ListTile(
            leading: const Icon(Icons.restaurant_menu_outlined),
            title: const Text('Menu'),
            subtitle: const Text('Categories, items, variants, modifiers, and tax groups'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(builder: (_) => const MenuManagementScreen())),
          )
        else
          const ListTile(
            leading: Icon(Icons.restaurant_menu_outlined),
            title: Text('Menu'),
            subtitle: Text('Ask an Owner or Manager for menu access'),
            enabled: false,
          ),
        const Divider(height: 1),
        if (canManagePrinters)
          ListTile(
            leading: const Icon(Icons.print_outlined),
            title: const Text('Printers'),
            subtitle: const Text('Register and manage receipt/kitchen printers'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push<void>(
              MaterialPageRoute(builder: (_) => const PrintersScreen()),
            ),
          )
        else
          const ListTile(
            leading: Icon(Icons.print_outlined),
            title: Text('Printers'),
            subtitle: Text('Ask an Owner or Manager to configure printers'),
            enabled: false,
          ),
        const Divider(height: 1),
        // Backend has recorded these since early on (AuditLogService, spec §23) — GET
        // /audit-logs had no UI consumer anywhere until now.
        if (canViewAudit)
          ListTile(
            leading: const Icon(Icons.history),
            title: const Text('Audit log'),
            subtitle: const Text('Menu, pricing, staff, and tax changes across every outlet'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(builder: (_) => const AuditLogScreen())),
          )
        else
          const ListTile(
            leading: Icon(Icons.history),
            title: Text('Audit log'),
            subtitle: Text('Ask an Owner or Manager for access'),
            enabled: false,
          ),
        const Divider(height: 1),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: () => ref.read(authSessionProvider.notifier).logout(),
        ),
      ],
    );
  }
}
