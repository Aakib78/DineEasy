import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/money/money.dart';
import '../../core/rbac/permissions.dart';
import 'data/menu_admin_models.dart';
import 'state/menu_admin_providers.dart';
import 'variant_edit_sheet.dart';

/// Create-or-edit screen for one `MenuItem`. Exactly one of [itemId] (edit) or
/// [initialCategoryId] (create, pre-filling the category the "Add item" button was pressed from)
/// is expected to be meaningful.
///
/// v1 scope note: creating an item only sets its core fields (name/price/description/...) —
/// variants and modifier-group attachments are added afterwards, from this same screen once the
/// item exists (both need a real `menuItemId` to attach to; `CreateMenuItemDto` technically
/// accepts them inline too, but keeping the create form short and pushing straight into edit
/// mode after saving is simpler than building two divergent forms for one screen).
class ItemEditScreen extends ConsumerStatefulWidget {
  const ItemEditScreen({super.key, this.itemId, this.initialCategoryId});

  final String? itemId;
  final String? initialCategoryId;

  @override
  ConsumerState<ItemEditScreen> createState() => _ItemEditScreenState();
}

class _ItemEditScreenState extends ConsumerState<ItemEditScreen> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final _skuController = TextEditingController();
  final _imageUrlController = TextEditingController();
  final _priceController = TextEditingController();
  String? _categoryId;
  String? _taxGroupId;
  bool _isVegetarian = true;
  bool _isAvailable = true;
  bool _isActive = true;
  bool _prefilled = false;
  bool _submitting = false;
  String? _error;

  bool get _isEdit => widget.itemId != null;

  @override
  void initState() {
    super.initState();
    _categoryId = widget.initialCategoryId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    _skuController.dispose();
    _imageUrlController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  void _prefillFrom(MenuItemAdmin item) {
    if (_prefilled) return;
    _prefilled = true;
    _nameController.text = item.name;
    _descController.text = item.description ?? '';
    _skuController.text = item.sku ?? '';
    _imageUrlController.text = item.imageUrl ?? '';
    _priceController.text = item.basePrice;
    _categoryId = item.categoryId;
    _taxGroupId = item.taxGroupId;
    _isVegetarian = item.isVegetarian;
    _isAvailable = item.isAvailable;
    _isActive = item.isActive;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.menuEdit) ?? false;

    if (!_isEdit) {
      return Scaffold(
        appBar: AppBar(title: const Text('Add item')),
        body: _buildForm(context, canEdit: canEdit, item: null),
      );
    }

    final itemAsync = ref.watch(itemDetailProvider(widget.itemId!));
    return Scaffold(
      appBar: AppBar(title: const Text('Edit item')),
      body: itemAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (item) {
          _prefillFrom(item);
          return _buildForm(context, canEdit: canEdit, item: item);
        },
      ),
    );
  }

  Widget _buildForm(BuildContext context, {required bool canEdit, required MenuItemAdmin? item}) {
    final categoriesAsync = ref.watch(menuTreeProvider);
    final taxGroupsAsync = ref.watch(taxGroupsListProvider);
    final modifierGroupsAsync = ref.watch(modifierGroupsListProvider);

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
                TextField(
                  controller: _descController,
                  decoration: const InputDecoration(
                    labelText: 'Description (optional)',
                    border: OutlineInputBorder(),
                  ),
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: 2,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _priceController,
                        decoration: const InputDecoration(
                          labelText: 'Base price',
                          prefixText: '₹',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _skuController,
                        decoration: const InputDecoration(
                          labelText: 'SKU (optional)',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _imageUrlController,
                  decoration: const InputDecoration(
                    labelText: 'Image URL (optional)',
                    helperText: 'No file upload in v1 — paste a hosted image link.',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                categoriesAsync.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text('Could not load categories: $e'),
                  data: (categories) => DropdownButtonFormField<String>(
                    // `value:`, not `initialValue:` — see tables_management_screen.dart's
                    // identical comment on the same rename.
                    value: _categoryId != null && categories.any((c) => c.id == _categoryId)
                        ? _categoryId
                        : null,
                    decoration: const InputDecoration(
                      labelText: 'Category',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      for (final c in categories) DropdownMenuItem(value: c.id, child: Text(c.name)),
                    ],
                    onChanged: (v) => setState(() => _categoryId = v),
                  ),
                ),
                const SizedBox(height: 12),
                taxGroupsAsync.when(
                  loading: () => const LinearProgressIndicator(),
                  error: (e, _) => Text('Could not load tax groups: $e'),
                  data: (taxGroups) => DropdownButtonFormField<String?>(
                    value: _taxGroupId != null && taxGroups.any((g) => g.id == _taxGroupId)
                        ? _taxGroupId
                        : null,
                    decoration: const InputDecoration(
                      labelText: 'Tax group (optional)',
                      border: OutlineInputBorder(),
                    ),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('None')),
                      for (final g in taxGroups) DropdownMenuItem(value: g.id, child: Text(g.name)),
                    ],
                    onChanged: (v) => setState(() => _taxGroupId = v),
                  ),
                ),
                const SizedBox(height: 4),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Vegetarian'),
                  value: _isVegetarian,
                  onChanged: (v) => setState(() => _isVegetarian = v),
                ),
                if (_isEdit) ...[
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Available'),
                    subtitle: const Text(
                      '"86 the item" — off means it can\'t be ordered right now, but stays '
                      'visible everywhere. Reflected live on POS and the guest QR menu.',
                    ),
                    value: _isAvailable,
                    onChanged: (v) => setState(() => _isAvailable = v),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Active'),
                    subtitle: const Text('Off hides this item everywhere, including from staff'),
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
                  onPressed: _submitting ? null : _submitCore,
                  child: Text(_submitting ? 'Saving…' : (_isEdit ? 'Save' : 'Create item')),
                ),
              ],
            ),
          ),
        ),
        if (_isEdit && item != null) ...[
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 8),
          Text('Variants', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Optional — e.g. Small/Medium/Large. Each has its own full price, not an add-on to '
            'the base price above.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
          ),
          const SizedBox(height: 8),
          for (final variant in item.variants)
            Card(
              child: ListTile(
                dense: true,
                title: Text(
                  '${variant.name}${variant.isDefault ? ' (default)' : ''}',
                  style: TextStyle(
                    color: variant.isActive ? null : Theme.of(context).colorScheme.outline,
                  ),
                ),
                subtitle: Text(
                  Money.parse(variant.priceOverride).format() +
                      (variant.isActive ? '' : ' · inactive'),
                ),
                trailing: canEdit ? const Icon(Icons.edit_outlined) : null,
                onTap: canEdit
                    ? () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) =>
                            VariantEditSheet(menuItemId: item.id, existing: variant),
                      )
                    : null,
              ),
            ),
          if (canEdit)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Add variant'),
                onPressed: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => VariantEditSheet(menuItemId: item.id),
                ),
              ),
            ),
          const SizedBox(height: 24),
          const Divider(),
          const SizedBox(height: 8),
          Text('Modifier groups', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'e.g. "Spice level" or "Toppings" — shared across items, managed from the tune icon '
            'on the Menu screen. Toggle which ones apply to this item below.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
          ),
          const SizedBox(height: 8),
          modifierGroupsAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Text('Could not load modifier groups: $e'),
            data: (groups) => _ModifierGroupPicker(item: item, allGroups: groups, canEdit: canEdit),
          ),
        ],
      ],
    );
  }

  Future<void> _submitCore() async {
    final name = _nameController.text.trim();
    final priceText = _priceController.text.trim();
    final price = double.tryParse(priceText);
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }
    if (price == null || price < 0) {
      setState(() => _error = 'Enter a valid base price.');
      return;
    }
    if (_categoryId == null) {
      setState(() => _error = 'Choose a category.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repo = ref.read(menuAdminRepositoryProvider);
      final desc = _descController.text.trim();
      final sku = _skuController.text.trim();
      final imageUrl = _imageUrlController.text.trim();

      if (!_isEdit) {
        final created = await repo.createItem(
          categoryId: _categoryId!,
          name: name,
          description: desc.isEmpty ? null : desc,
          sku: sku.isEmpty ? null : sku,
          imageUrl: imageUrl.isEmpty ? null : imageUrl,
          basePrice: price.toStringAsFixed(2),
          taxGroupId: _taxGroupId,
          isVegetarian: _isVegetarian,
        );
        ref.invalidate(menuTreeProvider);
        if (!mounted) return;
        // Straight into edit mode for the item just created, so variants/modifier groups can be
        // attached without a second round trip through the category list.
        Navigator.of(
          context,
        ).pushReplacement(MaterialPageRoute(builder: (_) => ItemEditScreen(itemId: created.id)));
        return;
      }

      await repo.updateItem(
        widget.itemId!,
        name: name,
        description: desc,
        sku: sku,
        imageUrl: imageUrl,
        basePrice: price.toStringAsFixed(2),
        taxGroupId: _taxGroupId,
        clearTaxGroup: _taxGroupId == null,
        categoryId: _categoryId,
        isVegetarian: _isVegetarian,
        isAvailable: _isAvailable,
        isActive: _isActive,
      );
      ref.invalidate(itemDetailProvider(widget.itemId!));
      ref.invalidate(menuTreeProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Item saved')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ModifierGroupPicker extends ConsumerStatefulWidget {
  const _ModifierGroupPicker({required this.item, required this.allGroups, required this.canEdit});

  final MenuItemAdmin item;
  final List<ModifierGroupAdmin> allGroups;
  final bool canEdit;

  @override
  ConsumerState<_ModifierGroupPicker> createState() => _ModifierGroupPickerState();
}

class _ModifierGroupPickerState extends ConsumerState<_ModifierGroupPicker> {
  late Set<String> _selected = widget.item.modifierGroups.map((g) => g.id).toSet();
  bool _dirty = false;
  bool _submitting = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    // Union of every active group plus whatever's already attached (even if since deactivated)
    // so an attachment never silently vanishes from this list just because a group went inactive
    // elsewhere.
    final attachedIds = widget.item.modifierGroups.map((g) => g.id).toSet();
    final visible = [
      for (final g in widget.allGroups)
        if (g.isActive || attachedIds.contains(g.id)) g,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (visible.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('No modifier groups exist yet.'),
          )
        else
          for (final group in visible)
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              enabled: widget.canEdit,
              value: _selected.contains(group.id),
              title: Text(group.name + (group.isActive ? '' : ' (inactive)')),
              subtitle: Text(
                '${group.modifiers.length} option${group.modifiers.length == 1 ? '' : 's'}'
                '${group.isRequired ? ' · required' : ''}',
              ),
              onChanged: (checked) => setState(() {
                if (checked ?? false) {
                  _selected.add(group.id);
                } else {
                  _selected.remove(group.id);
                }
                _dirty = true;
              }),
            ),
        if (_error != null) ...[
          const SizedBox(height: 4),
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        if (widget.canEdit && _dirty) ...[
          const SizedBox(height: 8),
          FilledButton.tonal(
            onPressed: _submitting ? null : _save,
            child: Text(_submitting ? 'Saving…' : 'Save modifier groups'),
          ),
        ],
      ],
    );
  }

  Future<void> _save() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref
          .read(menuAdminRepositoryProvider)
          .updateItem(widget.item.id, modifierGroupIds: _selected.toList());
      ref.invalidate(itemDetailProvider(widget.item.id));
      ref.invalidate(menuTreeProvider);
      if (!mounted) return;
      setState(() => _dirty = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Modifier groups saved')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
