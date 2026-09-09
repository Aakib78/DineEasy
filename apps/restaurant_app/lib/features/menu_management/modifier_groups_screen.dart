import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import 'data/modifier_groups_repository.dart';
import 'modifier_group_detail_screen.dart';
import 'state/menu_admin_providers.dart';

/// Lists every `ModifierGroup` for the outlet (outlet-scoped and reusable across items — see
/// docs/database.md "Why a reusable ModifierGroup"). Reached from the tune icon on
/// `MenuManagementScreen`. `menu.edit`-gated for create/edit, same view/edit split as that screen.
///
/// Uses [modifierGroupsAdminProvider] (active + inactive), not [modifierGroupsListProvider] —
/// the latter is active-only and feeds `ItemEditScreen`'s attach picker; this screen needs to
/// show a deactivated group too, since it's the only place staff could ever reactivate one.
class ModifierGroupsScreen extends ConsumerWidget {
  const ModifierGroupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.menuEdit) ?? false;
    final groupsAsync = ref.watch(modifierGroupsAdminProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Modifier groups')),
      floatingActionButton: canEdit
          ? FloatingActionButton.extended(
              onPressed: () => showModalBottomSheet<void>(
                context: context,
                isScrollControlled: true,
                builder: (_) => const _CreateGroupSheet(),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Add group'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(modifierGroupsAdminProvider);
          await ref.read(modifierGroupsAdminProvider.future);
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
                  'Groups like "Spice level" or "Toppings" — attach them to items from that '
                  "item's edit screen. A group can be used by many items at once.",
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                ),
              ),
              if (groups.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: Text('No modifier groups yet.')),
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
                        '${group.modifiers.length} option${group.modifiers.length == 1 ? '' : 's'}'
                        '${group.isRequired ? ' · required' : ''}'
                        '${group.isActive ? '' : ' · inactive'}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ModifierGroupDetailScreen(groupId: group.id),
                        ),
                      ),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CreateGroupSheet extends ConsumerStatefulWidget {
  const _CreateGroupSheet();

  @override
  ConsumerState<_CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends ConsumerState<_CreateGroupSheet> {
  final _nameController = TextEditingController();
  int _minSelect = 0;
  int _maxSelect = 1;
  bool _isRequired = false;
  final List<TextEditingController> _modifierNameControllers = [TextEditingController()];
  final List<TextEditingController> _modifierPriceControllers = [TextEditingController()];
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    for (final c in _modifierNameControllers) {
      c.dispose();
    }
    for (final c in _modifierPriceControllers) {
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
            Text('Add a modifier group', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'e.g. Spice level',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Min select',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    controller: TextEditingController(text: '$_minSelect'),
                    onChanged: (v) => _minSelect = int.tryParse(v) ?? 0,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      labelText: 'Max select',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.number,
                    controller: TextEditingController(text: '$_maxSelect'),
                    onChanged: (v) => _maxSelect = int.tryParse(v) ?? 1,
                  ),
                ),
              ],
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Required'),
              subtitle: const Text('Guest/staff must pick at least the minimum before ordering'),
              value: _isRequired,
              onChanged: (v) => setState(() => _isRequired = v),
            ),
            const SizedBox(height: 8),
            Text('Options', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            for (var i = 0; i < _modifierNameControllers.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: _modifierNameControllers[i],
                        decoration: const InputDecoration(
                          labelText: 'Name',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _modifierPriceControllers[i],
                        decoration: const InputDecoration(
                          labelText: '+₹',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    ),
                    if (_modifierNameControllers.length > 1)
                      IconButton(
                        icon: const Icon(Icons.remove_circle_outline),
                        onPressed: () => setState(() {
                          _modifierNameControllers.removeAt(i).dispose();
                          _modifierPriceControllers.removeAt(i).dispose();
                        }),
                      ),
                  ],
                ),
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add option'),
                onPressed: () => setState(() {
                  _modifierNameControllers.add(TextEditingController());
                  _modifierPriceControllers.add(TextEditingController());
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

    final modifiers = <ModifierInput>[];
    for (var i = 0; i < _modifierNameControllers.length; i++) {
      final mName = _modifierNameControllers[i].text.trim();
      if (mName.isEmpty) continue;
      final priceText = _modifierPriceControllers[i].text.trim();
      final price = priceText.isEmpty ? null : double.tryParse(priceText);
      modifiers.add(ModifierInput(name: mName, priceDelta: price?.toStringAsFixed(2)));
    }
    if (modifiers.isEmpty) {
      setState(() => _error = 'Add at least one option.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(modifierGroupsRepositoryProvider)
          .create(
            name: name,
            minSelect: _minSelect,
            maxSelect: _maxSelect,
            isRequired: _isRequired,
            modifiers: modifiers,
          );
      ref.invalidate(modifierGroupsListProvider);
      ref.invalidate(modifierGroupsAdminProvider);
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
