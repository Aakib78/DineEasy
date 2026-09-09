import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/money/money.dart';
import '../../core/rbac/permissions.dart';
import 'data/menu_admin_models.dart';
import 'item_edit_screen.dart';
import 'modifier_groups_screen.dart';
import 'state/menu_admin_providers.dart';
import 'tax_groups_screen.dart';

/// The menu management screen the rest of the app never had — full backend CRUD for
/// categories/items/variants/modifier-groups/tax-groups existed already (`MenuController`,
/// `ModifiersController`, `TaxController`), but the only way to touch any of it was a raw API
/// call. See docs/pos-web.md's "What's explicitly not built": staff/menu management is
/// Flutter-only in v1, so this lives here rather than in `apps/pos_web`.
///
/// `menu.view`-gated to reach at all (from `SettingsScreen`, same pattern as `PrintersScreen`'s
/// `printers.manage` gate); every add/edit affordance below additionally checks `menu.edit`
/// (Cashier/Waiter have view-only) so a view-only user still sees a genuinely read-only screen,
/// not just hidden buttons on an otherwise-editable one.
class MenuManagementScreen extends ConsumerWidget {
  const MenuManagementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.menuEdit) ?? false;
    final treeAsync = ref.watch(menuTreeProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Menu'),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Modifier groups',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(builder: (_) => const ModifierGroupsScreen())),
          ),
          IconButton(
            icon: const Icon(Icons.percent),
            tooltip: 'Tax groups',
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(builder: (_) => const TaxGroupsScreen())),
          ),
        ],
      ),
      floatingActionButton: canEdit
          ? FloatingActionButton.extended(
              onPressed: () => _showCategorySheet(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('Add category'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(menuTreeProvider);
          await ref.read(menuTreeProvider.future);
        },
        child: treeAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: '$error',
            onRetry: () => ref.invalidate(menuTreeProvider),
          ),
          data: (categories) => ListView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 84),
            children: [
              if (categories.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: Text('No categories yet.')),
                )
              else
                for (final category in categories)
                  _CategoryCard(category: category, canEdit: canEdit),
            ],
          ),
        ),
      ),
    );
  }

  void _showCategorySheet(BuildContext context, WidgetRef ref, {MenuCategoryAdmin? existing}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CategorySheet(existing: existing),
    );
  }
}

class _CategoryCard extends ConsumerWidget {
  const _CategoryCard({required this.category, required this.canEdit});

  final MenuCategoryAdmin category;
  final bool canEdit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ExpansionTile(
        title: Row(
          children: [
            Expanded(
              child: Text(
                category.name,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: category.isActive ? null : Theme.of(context).colorScheme.outline,
                ),
              ),
            ),
            if (!category.isActive)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Chip(
                  label: const Text('Inactive', style: TextStyle(fontSize: 11)),
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
          ],
        ),
        subtitle: Text('${category.items.length} item${category.items.length == 1 ? '' : 's'}'),
        trailing: canEdit
            ? IconButton(
                icon: const Icon(Icons.edit_outlined),
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => _CategorySheet(existing: category),
                ),
              )
            : null,
        children: [
          for (final item in category.items) _ItemTile(item: item),
          if (canEdit)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  icon: const Icon(Icons.add),
                  label: const Text('Add item'),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => ItemEditScreen(initialCategoryId: category.id),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item});

  final MenuItemAdmin item;

  @override
  Widget build(BuildContext context) {
    final dimmed = !item.isActive || !item.isAvailable;
    return ListTile(
      dense: true,
      leading: Icon(
        item.isVegetarian ? Icons.circle_outlined : Icons.change_history,
        color: item.isVegetarian ? Colors.green.shade700 : Colors.red.shade700,
        size: 18,
      ),
      title: Text(
        item.name,
        style: TextStyle(color: dimmed ? Theme.of(context).colorScheme.outline : null),
      ),
      subtitle: Text(
        [
          Money.parse(item.basePrice).format(),
          if (!item.isAvailable) '86ed',
          if (!item.isActive) 'inactive',
        ].join(' · '),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(
        context,
      ).push(MaterialPageRoute<void>(builder: (_) => ItemEditScreen(itemId: item.id))),
    );
  }
}

class _CategorySheet extends ConsumerStatefulWidget {
  const _CategorySheet({this.existing});

  final MenuCategoryAdmin? existing;

  @override
  ConsumerState<_CategorySheet> createState() => _CategorySheetState();
}

class _CategorySheetState extends ConsumerState<_CategorySheet> {
  late final _nameController = TextEditingController(text: widget.existing?.name ?? '');
  late final _descController = TextEditingController(text: widget.existing?.description ?? '');
  late bool _isActive = widget.existing?.isActive ?? true;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
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
              isEdit ? 'Edit category' : 'Add category',
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
              controller: _descController,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.sentences,
            ),
            if (isEdit) ...[
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                subtitle: const Text('Off hides this category from the public menu entirely'),
                value: _isActive,
                onChanged: (v) => setState(() => _isActive = v),
              ),
            ],
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
      final repo = ref.read(menuAdminRepositoryProvider);
      if (widget.existing == null) {
        await repo.createCategory(
          name: name,
          description: _descController.text.trim().isEmpty ? null : _descController.text.trim(),
        );
      } else {
        await repo.updateCategory(
          widget.existing!.id,
          name: name,
          description: _descController.text.trim(),
          isActive: _isActive,
        );
      }
      ref.invalidate(menuTreeProvider);
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
