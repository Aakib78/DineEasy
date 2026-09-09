import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/money/money.dart';
import '../../core/rbac/permissions.dart';
import 'data/menu_admin_models.dart';
import 'state/menu_admin_providers.dart';

final _groupDetailProvider = FutureProvider.autoDispose.family<ModifierGroupAdmin, String>((
  ref,
  id,
) {
  return ref.watch(modifierGroupsRepositoryProvider).getOne(id);
});

/// Edit one `ModifierGroup`'s metadata and manage its individual `Modifier`s — the latter was
/// the biggest real gap found in this module (see `ModifiersService.addModifier`'s backend doc
/// comment): before this screen, an option could only be added/edited by recreating the whole
/// group. Reached by tapping a group in `ModifierGroupsScreen`.
class ModifierGroupDetailScreen extends ConsumerStatefulWidget {
  const ModifierGroupDetailScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<ModifierGroupDetailScreen> createState() => _ModifierGroupDetailScreenState();
}

class _ModifierGroupDetailScreenState extends ConsumerState<ModifierGroupDetailScreen> {
  final _nameController = TextEditingController();
  final _minController = TextEditingController();
  final _maxController = TextEditingController();
  bool _isRequired = false;
  bool _isActive = true;
  bool _prefilled = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _minController.dispose();
    _maxController.dispose();
    super.dispose();
  }

  void _prefillFrom(ModifierGroupAdmin group) {
    if (_prefilled) return;
    _prefilled = true;
    _nameController.text = group.name;
    _minController.text = '${group.minSelect}';
    _maxController.text = '${group.maxSelect}';
    _isRequired = group.isRequired;
    _isActive = group.isActive;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.menuEdit) ?? false;
    final groupAsync = ref.watch(_groupDetailProvider(widget.groupId));

    return Scaffold(
      appBar: AppBar(title: const Text('Modifier group')),
      body: groupAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (group) {
          _prefillFrom(group);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              AbsorbPointer(
                absorbing: !canEdit,
                child: Opacity(
                  opacity: canEdit ? 1 : 0.6,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: 'Name',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _minController,
                              decoration: const InputDecoration(
                                labelText: 'Min select',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _maxController,
                              decoration: const InputDecoration(
                                labelText: 'Max select',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Required'),
                        value: _isRequired,
                        onChanged: (v) => setState(() => _isRequired = v),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Active'),
                        subtitle: const Text('Off hides this group from every item that uses it'),
                        value: _isActive,
                        onChanged: (v) => setState(() => _isActive = v),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 4),
                        Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ],
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _submitting ? null : () => _saveMeta(group),
                        child: Text(_submitting ? 'Saving…' : 'Save'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 8),
              Text('Options', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final modifier in group.modifiers)
                Card(
                  child: ListTile(
                    dense: true,
                    title: Text(
                      modifier.name,
                      style: TextStyle(
                        color: modifier.isActive ? null : Theme.of(context).colorScheme.outline,
                      ),
                    ),
                    subtitle: Text(
                      '+${Money.parse(modifier.priceDelta).format()}'
                      '${modifier.isActive ? '' : ' · inactive'}',
                    ),
                    trailing: canEdit ? const Icon(Icons.edit_outlined) : null,
                    onTap: canEdit
                        ? () => showModalBottomSheet<void>(
                            context: context,
                            isScrollControlled: true,
                            builder: (_) =>
                                _ModifierSheet(groupId: widget.groupId, existing: modifier),
                          )
                        : null,
                  ),
                ),
              if (canEdit)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('Add option'),
                    onPressed: () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => _ModifierSheet(groupId: widget.groupId),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _saveMeta(ModifierGroupAdmin group) async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }
    final min = int.tryParse(_minController.text.trim()) ?? 0;
    final max = int.tryParse(_maxController.text.trim()) ?? 1;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(modifierGroupsRepositoryProvider)
          .update(
            group.id,
            name: name,
            minSelect: min,
            maxSelect: max,
            isRequired: _isRequired,
            isActive: _isActive,
          );
      ref.invalidate(_groupDetailProvider(widget.groupId));
      ref.invalidate(modifierGroupsListProvider);
      ref.invalidate(modifierGroupsAdminProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ModifierSheet extends ConsumerStatefulWidget {
  const _ModifierSheet({required this.groupId, this.existing});

  final String groupId;
  final ModifierAdmin? existing;

  @override
  ConsumerState<_ModifierSheet> createState() => _ModifierSheetState();
}

class _ModifierSheetState extends ConsumerState<_ModifierSheet> {
  late final _nameController = TextEditingController(text: widget.existing?.name ?? '');
  late final _priceController = TextEditingController(text: widget.existing?.priceDelta ?? '');
  late bool _isActive = widget.existing?.isActive ?? true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _priceController.dispose();
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
              isEdit ? 'Edit option' : 'Add option',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _priceController,
              decoration: const InputDecoration(
                labelText: 'Price add-on',
                prefixText: '+₹',
                helperText: 'Added on top of the item price. Leave as 0 for no extra charge.',
                border: OutlineInputBorder(),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            if (isEdit)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                subtitle: const Text('Off hides this option from new orders'),
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
    final priceText = _priceController.text.trim();
    final price = priceText.isEmpty ? 0.0 : double.tryParse(priceText);
    if (price == null) {
      setState(() => _error = 'Enter a valid price.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repo = ref.read(modifierGroupsRepositoryProvider);
      if (widget.existing == null) {
        await repo.addModifier(widget.groupId, name: name, priceDelta: price.toStringAsFixed(2));
      } else {
        await repo.updateModifier(
          widget.groupId,
          widget.existing!.id,
          name: name,
          priceDelta: price.toStringAsFixed(2),
          isActive: _isActive,
        );
      }
      ref.invalidate(_groupDetailProvider(widget.groupId));
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
