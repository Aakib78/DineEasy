import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/network/api_exception.dart';
import '../../core/rbac/permissions.dart';
import '../pos/data/pos_models.dart';
import '../pos/state/pos_providers.dart';

/// Floor/table *management* — creating floors and tables, editing a table's name/capacity/
/// status, and rotating its QR token. Distinct from the POS's table picker (`pos_home_screen.dart`),
/// which is read-only and exists purely to start/continue an order; this screen is where a
/// manager sets the floor plan up in the first place (spec §5). Reuses the POS feature's data
/// layer (`tablesProvider`/`floorsProvider`/`tablesRepositoryProvider`) rather than duplicating
/// it — both screens are reading/writing the same `Floor`/`RestaurantTable` models.
class TablesManagementScreen extends ConsumerWidget {
  const TablesManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final floorsAsync = ref.watch(floorsProvider);
    final tablesAsync = ref.watch(tablesProvider);
    // `tables.view` (checked by home_shell to show this tab at all) only guarantees read access
    // — creating/editing is `tables.manage`. Hiding the mutating controls for a view-only role
    // (e.g. a Waiter) is UX only, same caveat as everywhere else in this app: PermissionsGuard
    // on the server is what actually blocks the write, this just avoids showing a button that's
    // guaranteed to 403.
    final canManage = ref.watch(currentUserProvider)?.hasPermission(Permissions.tablesManage) ?? false;

    return Scaffold(
      floatingActionButton: !canManage
          ? null
          : floorsAsync.maybeWhen(
              data: (floors) => FloatingActionButton.extended(
                onPressed: () => _showAddTableSheet(context, floors),
                icon: const Icon(Icons.add),
                label: const Text('Add table'),
              ),
              orElse: () => null,
            ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(floorsProvider);
          ref.invalidate(tablesProvider);
          await Future.wait<void>([
            ref.read(floorsProvider.future).then((_) {}),
            ref.read(tablesProvider.future).then((_) {}),
          ]);
        },
        child: floorsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: '$error',
            onRetry: () => ref.invalidate(floorsProvider),
          ),
          data: (floors) {
            return tablesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorState(
                message: '$error',
                onRetry: () => ref.invalidate(tablesProvider),
              ),
              data: (tables) {
                final sortedFloors = [...floors]
                  ..sort((a, b) => a.displayOrder.compareTo(b.displayOrder));

                return ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Floors & tables', style: Theme.of(context).textTheme.titleLarge),
                        if (canManage)
                          TextButton.icon(
                            onPressed: () => _showAddFloorSheet(context),
                            icon: const Icon(Icons.add),
                            label: const Text('Add floor'),
                          ),
                      ],
                    ),
                    if (sortedFloors.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Text('No floors yet — add one to start placing tables.'),
                      ),
                    for (final floor in sortedFloors) ...[
                      const SizedBox(height: 16),
                      Text(floor.name, style: Theme.of(context).textTheme.titleMedium),
                      const Divider(),
                      ...tables.where((t) => t.floorId == floor.id).map(
                        (table) => _TableListTile(
                          table: table,
                          onTap: canManage ? () => _showEditTableSheet(context, table) : null,
                        ),
                      ),
                      if (tables.where((t) => t.floorId == floor.id).isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            'No tables on this floor yet.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                    ],
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }

  void _showAddFloorSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddFloorSheet(),
    );
  }

  void _showAddTableSheet(BuildContext context, List<Floor> floors) {
    if (floors.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Add a floor first.')));
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddTableSheet(floors: floors),
    );
  }

  void _showEditTableSheet(BuildContext context, RestaurantTable table) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditTableSheet(table: table),
    );
  }
}

class _TableListTile extends StatelessWidget {
  const _TableListTile({required this.table, required this.onTap});

  final RestaurantTable table;

  /// Null for a view-only user — see `canManage` in `TablesManagementScreen.build`.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (table.status) {
      TableStatus.available => (Icons.check_circle_outline, Colors.green.shade700),
      TableStatus.occupied => (Icons.people_outline, Colors.orange.shade700),
      TableStatus.reserved => (Icons.event_seat_outlined, Colors.amber.shade800),
      TableStatus.disabled => (Icons.block, Theme.of(context).colorScheme.outline),
    };

    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(table.name),
      subtitle: Text('${table.capacity} seats · ${_statusLabel(table.status)}'),
      trailing: onTap != null ? const Icon(Icons.chevron_right) : null,
      onTap: onTap,
    );
  }

  String _statusLabel(TableStatus status) => switch (status) {
    TableStatus.available => 'Available',
    TableStatus.occupied => 'Occupied',
    TableStatus.reserved => 'Reserved',
    TableStatus.disabled => 'Disabled',
  };
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

/// Shared shell for the three bottom sheets below — keeps padding/scroll-with-keyboard handling
/// (`MediaQuery.viewInsetsOf`) in one place rather than repeated three times.
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }
}

class _AddFloorSheet extends ConsumerStatefulWidget {
  const _AddFloorSheet();

  @override
  ConsumerState<_AddFloorSheet> createState() => _AddFloorSheetState();
}

class _AddFloorSheetState extends ConsumerState<_AddFloorSheet> {
  final _nameController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      children: [
        Text('Add floor', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        TextField(
          controller: _nameController,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Floor name', border: OutlineInputBorder()),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _submit(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: Text(_submitting ? 'Adding…' : 'Add floor'),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name for this floor.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(tablesRepositoryProvider).createFloor(name: name);
      ref.invalidate(floorsProvider);
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

class _AddTableSheet extends ConsumerStatefulWidget {
  const _AddTableSheet({required this.floors});

  final List<Floor> floors;

  @override
  ConsumerState<_AddTableSheet> createState() => _AddTableSheetState();
}

class _AddTableSheetState extends ConsumerState<_AddTableSheet> {
  final _nameController = TextEditingController();
  final _capacityController = TextEditingController(text: '2');
  late String _floorId = widget.floors.first.id;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _capacityController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      children: [
        Text('Add table', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          // `value:`, not the newer `initialValue:` — pubspec.yaml's SDK floor is Flutter
          // 3.22.0, which predates that rename; `value:` stays supported (deprecated-but-
          // functional, per Flutter's long deprecation window) across the whole declared range.
          value: _floorId,
          decoration: const InputDecoration(labelText: 'Floor', border: OutlineInputBorder()),
          items: [
            for (final floor in widget.floors)
              DropdownMenuItem(value: floor.id, child: Text(floor.name)),
          ],
          onChanged: (value) {
            if (value != null) setState(() => _floorId = value);
          },
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _nameController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Table name',
            hintText: 'e.g. T-12',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _capacityController,
          decoration: const InputDecoration(labelText: 'Seats', border: OutlineInputBorder()),
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _submitting ? null : _submit,
          child: Text(_submitting ? 'Adding…' : 'Add table'),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name for this table.');
      return;
    }
    final capacity = int.tryParse(_capacityController.text.trim());

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(tablesRepositoryProvider)
          .createTable(
            floorId: _floorId,
            name: name,
            capacity: (capacity != null && capacity > 0) ? capacity : null,
          );
      ref.invalidate(tablesProvider);
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

class _EditTableSheet extends ConsumerStatefulWidget {
  const _EditTableSheet({required this.table});

  final RestaurantTable table;

  @override
  ConsumerState<_EditTableSheet> createState() => _EditTableSheetState();
}

class _EditTableSheetState extends ConsumerState<_EditTableSheet> {
  late final _nameController = TextEditingController(text: widget.table.name);
  late final _capacityController = TextEditingController(text: '${widget.table.capacity}');
  late TableStatus _status = widget.table.status;
  late TableQrCode? _qrCode = widget.table.qrCode;
  bool _saving = false;
  bool _regenerating = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _capacityController.dispose();
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
              child: Text('Edit ${widget.table.name}', style: Theme.of(context).textTheme.headlineSmall),
            ),
            IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _nameController,
          decoration: const InputDecoration(labelText: 'Table name', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _capacityController,
          decoration: const InputDecoration(labelText: 'Seats', border: OutlineInputBorder()),
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<TableStatus>(
          value: _status,
          decoration: const InputDecoration(labelText: 'Status', border: OutlineInputBorder()),
          items: const [
            DropdownMenuItem(value: TableStatus.available, child: Text('Available')),
            DropdownMenuItem(value: TableStatus.occupied, child: Text('Occupied')),
            DropdownMenuItem(value: TableStatus.reserved, child: Text('Reserved')),
            DropdownMenuItem(value: TableStatus.disabled, child: Text('Disabled')),
          ],
          onChanged: (value) {
            if (value != null) setState(() => _status = value);
          },
        ),
        const SizedBox(height: 16),
        const Divider(),
        Row(
          children: [
            Expanded(
              child: Text(
                'QR token: ${_qrCode != null ? '${_qrCode!.token.substring(0, 8)}…' : 'none yet'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            TextButton(
              onPressed: _regenerating ? null : _regenerateQr,
              child: Text(_regenerating ? 'Regenerating…' : 'Regenerate QR'),
            ),
          ],
        ),
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
      setState(() => _error = "Table name can't be empty.");
      return;
    }
    final capacity = int.tryParse(_capacityController.text.trim());

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await ref
          .read(tablesRepositoryProvider)
          .updateTable(
            widget.table.id,
            name: name.isNotEmpty && name != widget.table.name ? name : null,
            capacity: (capacity != null && capacity > 0 && capacity != widget.table.capacity)
                ? capacity
                : null,
            status: _status != widget.table.status ? _status : null,
          );
      ref.invalidate(tablesProvider);
      // A status change (e.g. marking a table Disabled) can also affect whether it still shows
      // up as "has an open order" on the POS floor view — invalidating active orders too keeps
      // that in sync rather than waiting for its own next natural refetch.
      ref.invalidate(activeOrdersProvider);
      if (!mounted) return;
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _regenerateQr() async {
    setState(() {
      _regenerating = true;
      _error = null;
    });

    try {
      final newQrCode = await ref.read(tablesRepositoryProvider).regenerateQrCode(widget.table.id);
      ref.invalidate(tablesProvider);
      if (!mounted) return;
      setState(() => _qrCode = newQrCode);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR code regenerated — any old printed code for this table is now invalid.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _regenerating = false);
    }
  }
}
