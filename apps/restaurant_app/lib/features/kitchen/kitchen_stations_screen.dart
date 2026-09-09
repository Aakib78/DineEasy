import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import 'data/kds_models.dart';
import 'state/kitchen_providers.dart';

/// `POST /kitchen/stations` existed with zero UI callers — the only way to add a station was a
/// raw API call, and `GET /kitchen/stations` (the KDS filter chips) was the sole consumer of
/// anything in this module's stations. Reached from Settings' "Kitchen stations" entry.
///
/// `kitchen.view`-gated to reach at all (matching the backend's own gate on `listStations`);
/// create/edit is `settings.manage`-gated (matching `createStation`/`updateStation`'s server-side
/// gate — the same permission tax-group create/edit uses, not `menu.edit`).
///
/// Important scope note surfaced right on the screen, not just in a code comment: v1 doesn't
/// actually route any KOT to a station yet (`OrdersService.createKitchenOrder` always creates
/// `stationId: null`) — a station today is only a manual filter on the KDS queue view, not
/// something orders get assigned to. Creating one here doesn't yet change what any ticket shows.
class KitchenStationsScreen extends ConsumerWidget {
  const KitchenStationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.settingsManage) ?? false;
    final stationsAsync = ref.watch(kitchenStationsAdminProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Kitchen stations')),
      floatingActionButton: canEdit
          ? FloatingActionButton.extended(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => const _StationSheet(),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Add station'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(kitchenStationsAdminProvider);
          await ref.read(kitchenStationsAdminProvider.future);
        },
        child: stationsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
          data: (stations) => ListView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 84),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text(
                  "Stations are a manual filter on the kitchen display's queue view (e.g. "
                  '"Grill", "Fryer") — v1 doesn\'t route tickets to one automatically, so adding '
                  "a station here doesn't change what any ticket shows until staff filter by it.",
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                ),
              ),
              if (stations.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: Text('No kitchen stations yet.')),
                )
              else
                for (final station in stations)
                  Card(
                    child: ListTile(
                      title: Text(
                        station.name,
                        style: TextStyle(
                          color: station.isActive ? null : Theme.of(context).colorScheme.outline,
                        ),
                      ),
                      subtitle: station.isActive ? null : const Text('Inactive'),
                      trailing: canEdit
                          ? IconButton(
                              icon: const Icon(Icons.edit_outlined),
                              onPressed: () => showModalBottomSheet<void>(
                                context: context,
                                isScrollControlled: true,
                                builder: (_) => _StationSheet(existing: station),
                              ),
                            )
                          : null,
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StationSheet extends ConsumerStatefulWidget {
  const _StationSheet({this.existing});

  final KitchenStation? existing;

  @override
  ConsumerState<_StationSheet> createState() => _StationSheetState();
}

class _StationSheetState extends ConsumerState<_StationSheet> {
  late final _nameController = TextEditingController(text: widget.existing?.name ?? '');
  late bool _isActive = widget.existing?.isActive ?? true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.existing != null;
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
          children: [
            Text(
              isEdit ? 'Edit station' : 'Add station',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'e.g. Grill',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.words,
            ),
            if (isEdit)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                subtitle: const Text('Off hides this station from the KDS filter'),
                value: _isActive,
                onChanged: (v) => setState(() => _isActive = v),
              ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: Text(_submitting ? 'Saving…' : 'Save'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repo = ref.read(kitchenRepositoryProvider);
      if (widget.existing == null) {
        await repo.createStation(name);
      } else {
        await repo.updateStation(widget.existing!.id, name: name, isActive: _isActive);
      }
      ref.invalidate(kitchenStationsAdminProvider);
      ref.invalidate(kitchenStationsProvider);
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
