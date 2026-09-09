import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import 'data/menu_admin_models.dart';
import 'data/tax_groups_repository.dart';
import 'state/menu_admin_providers.dart';

/// Lists `TaxGroup`s (e.g. "GST 5%" = CGST 2.5% + SGST 2.5%) — see docs/database.md "Why
/// TaxGroup + TaxGroupComponent". Reached from the percent icon on `MenuManagementScreen`.
///
/// Create and edit are gated on `settings.manage`, not `menu.edit` — matching the backend's
/// asymmetry (`TaxController.create`/`update` both require `SETTINGS_MANAGE`; list/get require
/// no permission beyond being signed in). A Manager who can edit the rest of the menu still
/// can't touch tax groups; only Owner can here.
class TaxGroupsScreen extends ConsumerWidget {
  const TaxGroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.settingsManage) ?? false;
    final groupsAsync = ref.watch(taxGroupsListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Tax groups')),
      floatingActionButton: canEdit
          ? FloatingActionButton.extended(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => const _CreateTaxGroupSheet(),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Add tax group'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(taxGroupsListProvider);
          await ref.read(taxGroupsListProvider.future);
        },
        child: groupsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (groups) => ListView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 84),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                child: Text(
                  'Applied to menu items via their "Tax group" field. Component rates can\'t be '
                  'edited in place once created — deactivate a group and create a new one if a '
                  'rate changes.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                ),
              ),
              if (groups.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: Text('No tax groups yet.')),
                )
              else
                for (final group in groups)
                  Card(
                    child: ListTile(
                      title: Text(
                        group.name,
                        style: TextStyle(
                          color: group.isActive ? null : Theme.of(context).colorScheme.outline,
                        ),
                      ),
                      subtitle: Text(
                        group.components
                                .map((c) => '${taxTypeLabel(c.taxType)} ${c.ratePercent}%')
                                .join(' + ') +
                            (group.isActive ? '' : ' · inactive'),
                      ),
                      trailing: canEdit
                          ? IconButton(
                              icon: const Icon(Icons.edit_outlined),
                              onPressed: () => showModalBottomSheet<void>(
                                context: context,
                                isScrollControlled: true,
                                builder: (_) => _EditTaxGroupSheet(existing: group),
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

class _CreateTaxGroupSheet extends ConsumerStatefulWidget {
  const _CreateTaxGroupSheet();

  @override
  ConsumerState<_CreateTaxGroupSheet> createState() => _CreateTaxGroupSheetState();
}

class _CreateTaxGroupSheetState extends ConsumerState<_CreateTaxGroupSheet> {
  final _nameController = TextEditingController();
  final List<TaxType> _componentTypes = [TaxType.cgst];
  final List<TextEditingController> _componentRateControllers = [TextEditingController()];
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    for (final c in _componentRateControllers) {
      c.dispose();
    }
    super.dispose();
  }

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
          children: [
            Text('Add a tax group', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'e.g. GST 5%',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Text('Components', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            for (var i = 0; i < _componentTypes.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: DropdownButtonFormField<TaxType>(
                        value: _componentTypes[i],
                        decoration: const InputDecoration(
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: [
                          for (final t in TaxType.values)
                            DropdownMenuItem(value: t, child: Text(taxTypeLabel(t))),
                        ],
                        onChanged: (v) => setState(() => _componentTypes[i] = v ?? TaxType.cgst),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _componentRateControllers[i],
                        decoration: const InputDecoration(
                          labelText: '%',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    ),
                    if (_componentTypes.length > 1)
                      IconButton(
                        icon: const Icon(Icons.remove_circle_outline),
                        onPressed: () => setState(() {
                          _componentTypes.removeAt(i);
                          _componentRateControllers.removeAt(i).dispose();
                        }),
                      ),
                  ],
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add component'),
                onPressed: () => setState(() {
                  _componentTypes.add(TaxType.cgst);
                  _componentRateControllers.add(TextEditingController());
                }),
              ),
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

    final components = <TaxComponentInput>[];
    for (var i = 0; i < _componentTypes.length; i++) {
      final rate = double.tryParse(_componentRateControllers[i].text.trim());
      if (rate == null || rate < 0 || rate > 100) {
        setState(() => _error = 'Enter a valid rate (0–100) for every component.');
        return;
      }
      components.add(TaxComponentInput(taxType: _componentTypes[i], ratePercent: rate.toStringAsFixed(2)));
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(taxGroupsRepositoryProvider).create(name: name, components: components);
      ref.invalidate(taxGroupsListProvider);
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

class _EditTaxGroupSheet extends ConsumerStatefulWidget {
  const _EditTaxGroupSheet({required this.existing});

  final TaxGroup existing;

  @override
  ConsumerState<_EditTaxGroupSheet> createState() => _EditTaxGroupSheetState();
}

class _EditTaxGroupSheetState extends ConsumerState<_EditTaxGroupSheet> {
  late final _nameController = TextEditingController(text: widget.existing.name);
  late bool _isActive = widget.existing.isActive;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

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
          children: [
            Text('Edit tax group', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 4),
            Text(
              'Components: '
              '${widget.existing.components.map((c) => '${taxTypeLabel(c.taxType)} ${c.ratePercent}%').join(' + ')}'
              ' — rates can\'t be edited here (see this screen\'s note).',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
            ),
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Active'),
              subtitle: const Text('Off stops new menu items from using this group'),
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
      await ref
          .read(taxGroupsRepositoryProvider)
          .update(widget.existing.id, name: name, isActive: _isActive);
      ref.invalidate(taxGroupsListProvider);
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
