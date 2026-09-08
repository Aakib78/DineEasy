import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/network/api_exception.dart';
import '../../core/rbac/permissions.dart';
import 'data/staff_models.dart';
import 'state/staff_providers.dart';

/// Staff *management* — list every staff account in the organization, invite (create) new
/// ones, and edit an existing one's name/phone/status/role assignment. `staff.view` (checked by
/// `home_shell.dart` to show this tab at all) only guarantees read access; creating/editing is
/// `staff.manage` — same UX-only gating pattern as every other feature screen in this app
/// (`PermissionsGuard` on the server is the real enforcement).
class StaffScreen extends ConsumerWidget {
  const StaffScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final staffAsync = ref.watch(staffListProvider);
    final rolesAsync = ref.watch(staffRolesProvider);
    final outletsAsync = ref.watch(staffOutletsProvider);
    final currentUser = ref.watch(currentUserProvider);
    final canManage = currentUser?.hasPermission(Permissions.staffManage) ?? false;

    return Scaffold(
      // The FAB needs both roles and outlets loaded before it can safely open the Add-staff
      // sheet (its dropdowns need a real, already-fetched list to pick a valid default value
      // from — see `_AddStaffSheet`'s doc comment) — `maybeWhen` nested this way just hides the
      // FAB rather than showing one that would crash on tap while either list is still loading.
      floatingActionButton: !canManage
          ? null
          : rolesAsync.maybeWhen(
              data: (roles) => outletsAsync.maybeWhen(
                data: (outlets) => FloatingActionButton.extended(
                  onPressed: roles.isEmpty
                      ? null
                      : () => _showAddStaffSheet(context, roles, outlets, currentUser?.activeOutletId),
                  icon: const Icon(Icons.person_add),
                  label: const Text('Add staff'),
                ),
                orElse: () => null,
              ),
              orElse: () => null,
            ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(staffListProvider);
          ref.invalidate(staffRolesProvider);
          ref.invalidate(staffOutletsProvider);
          await Future.wait<void>([
            ref.read(staffListProvider.future).then((_) {}),
            ref.read(staffRolesProvider.future).then((_) {}),
            ref.read(staffOutletsProvider.future).then((_) {}),
          ]);
        },
        child: staffAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) =>
              _ErrorState(message: '$error', onRetry: () => ref.invalidate(staffListProvider)),
          data: (staff) => rolesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, _) =>
                _ErrorState(message: '$error', onRetry: () => ref.invalidate(staffRolesProvider)),
            data: (roles) => outletsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorState(
                message: '$error',
                onRetry: () => ref.invalidate(staffOutletsProvider),
              ),
              data: (outlets) {
                if (staff.isEmpty) {
                  return ListView(
                    children: const [
                      Padding(
                        padding: EdgeInsets.symmetric(vertical: 48),
                        child: Center(child: Text('No staff accounts yet.')),
                      ),
                    ],
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: staff.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) => _StaffTile(
                    member: staff[index],
                    onTap: canManage
                        ? () => _showEditStaffSheet(context, staff[index], roles, outlets)
                        : null,
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  void _showAddStaffSheet(
    BuildContext context,
    List<StaffRole> roles,
    List<StaffOutlet> outlets,
    String? defaultOutletId,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddStaffSheet(
        roles: roles,
        outlets: outlets,
        defaultOutletId: defaultOutletId,
      ),
    );
  }

  void _showEditStaffSheet(
    BuildContext context,
    StaffMember member,
    List<StaffRole> roles,
    List<StaffOutlet> outlets,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditStaffSheet(member: member, roles: roles, outlets: outlets),
    );
  }
}

class _StaffTile extends StatelessWidget {
  const _StaffTile({required this.member, required this.onTap});

  final StaffMember member;

  /// Null for a view-only user — see `canManage` in `StaffScreen.build`.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (statusLabel, statusColor) = switch (member.status) {
      StaffStatus.active => ('Active', Colors.green.shade700),
      StaffStatus.inactive => ('Inactive', Theme.of(context).colorScheme.outline),
      StaffStatus.suspended => ('Suspended', Colors.red.shade700),
    };

    return Card(
      child: ListTile(
        onTap: onTap,
        title: Text(member.name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(member.email),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: member.roles.isEmpty
                  ? [Text('No role assigned', style: Theme.of(context).textTheme.bodySmall)]
                  : [
                      for (final role in member.roles)
                        Chip(
                          label: Text(
                            role.outletName != null
                                ? '${role.roleName} · ${role.outletName}'
                                : '${role.roleName} · All outlets',
                          ),
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                    ],
            ),
          ],
        ),
        isThreeLine: true,
        trailing: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(statusLabel, style: TextStyle(color: statusColor, fontWeight: FontWeight.w600)),
            if (onTap != null) const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}

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

/// Shared shell for the two bottom sheets below — same padding/scroll-with-keyboard handling as
/// `tables_management_screen.dart`'s `_SheetShell`, duplicated rather than shared across feature
/// folders since it's a handful of lines and this app has no `lib/core/widgets/` yet.
class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children,
        ),
      ),
    );
  }
}

bool _looksLikeEmail(String value) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);

class _AddStaffSheet extends ConsumerStatefulWidget {
  /// `roles`/`outlets` are passed in already-resolved (from `StaffScreen`'s own `.when(data:
  /// ...)` branches) rather than watched again here — this sheet's dropdowns pick their initial
  /// value in `initState`, and doing that safely requires the list to already be non-null and
  /// non-empty by construction, not a `FutureProvider` that could still be loading. Mirrors
  /// `_AddTableSheet(floors: floors)` in `tables_management_screen.dart`.
  const _AddStaffSheet({required this.roles, required this.outlets, this.defaultOutletId});

  final List<StaffRole> roles;
  final List<StaffOutlet> outlets;

  /// The current user's own active outlet, used as a friendlier default than "org-wide" for the
  /// common case of a manager adding staff to their own outlet — but only applied if that id is
  /// actually present in `outlets` (defensive: a stale/cross-org id here must never be handed to
  /// `DropdownButtonFormField` as its `value`, since Flutter asserts that value must match one of
  /// `items` and would throw).
  final String? defaultOutletId;

  @override
  ConsumerState<_AddStaffSheet> createState() => _AddStaffSheetState();
}

class _AddStaffSheetState extends ConsumerState<_AddStaffSheet> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _phoneController = TextEditingController();
  late String _roleId = widget.roles.first.id;
  late String? _outletId = _validDefaultOutletId();
  bool _obscurePassword = true;
  bool _submitting = false;
  String? _error;

  String? _validDefaultOutletId() {
    final candidate = widget.defaultOutletId;
    if (candidate == null) return null;
    for (final outlet in widget.outlets) {
      if (outlet.id == candidate) return candidate;
    }
    return null;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      children: [
        Text('Add staff', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        TextField(
          controller: _nameController,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Full name', border: OutlineInputBorder()),
          textCapitalization: TextCapitalization.words,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _emailController,
          decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _passwordController,
          decoration: InputDecoration(
            labelText: 'Temporary password',
            helperText: 'At least 8 characters — they can change it after signing in.',
            border: const OutlineInputBorder(),
            suffixIcon: IconButton(
              icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
            ),
          ),
          obscureText: _obscurePassword,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phoneController,
          decoration: const InputDecoration(
            labelText: 'Phone (optional)',
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          // `value:`, not `initialValue:` — see tables_management_screen.dart's identical
          // comment on this SDK-version ambiguity; the same reasoning applies to every
          // DropdownButtonFormField in this app.
          value: _roleId,
          decoration: const InputDecoration(labelText: 'Role', border: OutlineInputBorder()),
          items: [
            for (final role in widget.roles) DropdownMenuItem(value: role.id, child: Text(role.name)),
          ],
          onChanged: (value) {
            if (value != null) setState(() => _roleId = value);
          },
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String?>(
          value: _outletId,
          decoration: const InputDecoration(labelText: 'Outlet', border: OutlineInputBorder()),
          items: [
            const DropdownMenuItem(value: null, child: Text('Org-wide (all outlets)')),
            for (final outlet in widget.outlets)
              DropdownMenuItem(value: outlet.id, child: Text(outlet.name)),
          ],
          onChanged: (value) => setState(() => _outletId = value),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: Text(_submitting ? 'Adding…' : 'Add staff'),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    final phone = _phoneController.text.trim();

    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }
    if (!_looksLikeEmail(email)) {
      setState(() => _error = 'Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setState(() => _error = 'Password must be at least 8 characters.');
      return;
    }

    final role = widget.roles.firstWhere((r) => r.id == _roleId);

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(staffRepositoryProvider).createStaff(
            name: name,
            email: email,
            password: password,
            phone: phone.isEmpty ? null : phone,
            roleName: role.name,
            outletId: _outletId,
          );
      ref.invalidate(staffListProvider);
      if (!mounted) return;
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _EditStaffSheet extends ConsumerStatefulWidget {
  const _EditStaffSheet({required this.member, required this.roles, required this.outlets});

  final StaffMember member;
  final List<StaffRole> roles;
  final List<StaffOutlet> outlets;

  @override
  ConsumerState<_EditStaffSheet> createState() => _EditStaffSheetState();
}

class _EditStaffSheetState extends ConsumerState<_EditStaffSheet> {
  late final _nameController = TextEditingController(text: widget.member.name);
  late final _phoneController = TextEditingController(text: widget.member.phone ?? '');
  late StaffStatus _status = widget.member.status;

  /// Null = "leave role assignments unchanged" (the sheet's default) — only sending `roleName`
  /// to the backend at all is what triggers a reassignment, so this sentinel matters: it's not
  /// the same thing as "assign an org-wide role", which is `_roleId != null && _outletId ==
  /// null`. See `StaffRepository.updateStaff`'s doc comment for the full semantics, including
  /// why reassigning to a different outlet *adds* a role rather than moving the existing one.
  String? _roleId;
  String? _outletId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                'Edit ${widget.member.name}',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _nameController,
          decoration: const InputDecoration(labelText: 'Full name', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phoneController,
          decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder()),
          keyboardType: TextInputType.phone,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<StaffStatus>(
          value: _status,
          decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: StaffStatus.active, child: Text('Active')),
            DropdownMenuItem(value: StaffStatus.inactive, child: Text('Inactive')),
            DropdownMenuItem(value: StaffStatus.suspended, child: Text('Suspended')),
          ],
          onChanged: (value) {
            if (value != null) setState(() => _status = value);
          },
        ),
        const SizedBox(height: 16),
        const Divider(),
        Text('Current roles', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 4,
          children: widget.member.roles.isEmpty
              ? [Text('None yet', style: Theme.of(context).textTheme.bodySmall)]
              : [
                  for (final role in widget.member.roles)
                    Chip(
                      label: Text(
                        role.outletName != null
                            ? '${role.roleName} · ${role.outletName}'
                            : '${role.roleName} · All outlets',
                      ),
                      visualDensity: VisualDensity.compact,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                ],
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String?>(
          value: _roleId,
          decoration: const InputDecoration(
            labelText: 'Assign a role',
            helperText: "Adds or replaces this person's role for the chosen outlet — existing "
                'assignments for other outlets are unaffected.',
            helperMaxLines: 2,
            border: OutlineInputBorder(),
          ),
          items: [
            const DropdownMenuItem(value: null, child: Text('No change')),
            for (final role in widget.roles)
              DropdownMenuItem(value: role.id, child: Text(role.name)),
          ],
          onChanged: (value) => setState(() => _roleId = value),
        ),
        if (_roleId != null) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            value: _outletId,
            decoration: const InputDecoration(labelText: 'For outlet', border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem(value: null, child: Text('Org-wide (all outlets)')),
              for (final outlet in widget.outlets)
                DropdownMenuItem(value: outlet.id, child: Text(outlet.name)),
            ],
            onChanged: (value) => setState(() => _outletId = value),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: Text(_saving ? 'Saving…' : 'Save changes'),
        ),
      ],
    );
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = "Name can't be empty.");
      return;
    }
    final phone = _phoneController.text.trim();

    String? roleName;
    if (_roleId != null) {
      roleName = widget.roles.firstWhere((r) => r.id == _roleId).name;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await ref.read(staffRepositoryProvider).updateStaff(
            widget.member.id,
            name: name != widget.member.name ? name : null,
            phone: phone != (widget.member.phone ?? '') ? phone : null,
            status: _status != widget.member.status ? _status : null,
            roleName: roleName,
            outletId: roleName != null ? _outletId : null,
          );
      ref.invalidate(staffListProvider);
      if (!mounted) return;
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}
