import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'data/menu_admin_models.dart';
import 'state/menu_admin_providers.dart';

/// Add-or-edit sheet for one `MenuItemVariant`, e.g. Small/Medium/Large. `priceOverride` is an
/// absolute price, not a delta on top of `basePrice` — see `MenuItemVariantAdmin`'s doc comment.
class VariantEditSheet extends ConsumerStatefulWidget {
  const VariantEditSheet({super.key, required this.menuItemId, this.existing});

  final String menuItemId;
  final MenuItemVariantAdmin? existing;

  @override
  ConsumerState<VariantEditSheet> createState() => _VariantEditSheetState();
}

class _VariantEditSheetState extends ConsumerState<VariantEditSheet> {
  late final _nameController = TextEditingController(text: widget.existing?.name ?? '');
  late final _priceController = TextEditingController(
    text: widget.existing?.priceOverride ?? '',
  );
  late bool _isDefault = widget.existing?.isDefault ?? false;
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
              isEdit ? 'Edit variant' : 'Add variant',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Name',
                hintText: 'e.g. Large',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _priceController,
              decoration: const InputDecoration(
                labelText: 'Price',
                prefixText: '₹',
                helperText: 'The full price for this variant, not an add-on to the base price.',
                border: OutlineInputBorder(),
              ),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 4),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Default variant'),
              subtitle: const Text('Pre-selected when this item is added to an order'),
              value: _isDefault,
              onChanged: (v) => setState(() => _isDefault = v),
            ),
            if (isEdit)
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Active'),
                subtitle: const Text('Off hides this variant from new orders'),
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
    final priceText = _priceController.text.trim();
    final price = double.tryParse(priceText);
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }
    if (price == null || price < 0) {
      setState(() => _error = 'Enter a valid price.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final repo = ref.read(menuAdminRepositoryProvider);
      if (widget.existing == null) {
        await repo.addVariant(
          widget.menuItemId,
          name: name,
          priceOverride: price.toStringAsFixed(2),
          isDefault: _isDefault,
        );
      } else {
        await repo.updateVariant(
          widget.menuItemId,
          widget.existing!.id,
          name: name,
          priceOverride: price.toStringAsFixed(2),
          isDefault: _isDefault,
          isActive: _isActive,
        );
      }
      ref.invalidate(itemDetailProvider(widget.menuItemId));
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
