import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import 'data/organization_models.dart';
import 'state/organization_providers.dart';

/// `GET`/`PATCH /organizations/me` existed with `UpdateOrganizationDto` (name, legal name,
/// GSTIN, contact, address) but no UI anywhere — the only way to set a restaurant's own business
/// details was a raw API call. Reached via Settings' "Business profile" entry.
///
/// Viewing has no permission gate server-side (any signed-in user can read their own org's
/// info), so every role reaches this screen; editing is `settings.manage`-gated (Owner only
/// among the system roles — see `permissions.catalog.ts`'s role table), same
/// AbsorbPointer-dims-the-form pattern as `TaxGroupsScreen`'s edit sheet.
class OrganizationSettingsScreen extends ConsumerStatefulWidget {
  const OrganizationSettingsScreen({super.key});

  @override
  ConsumerState<OrganizationSettingsScreen> createState() => _OrganizationSettingsScreenState();
}

class _OrganizationSettingsScreenState extends ConsumerState<OrganizationSettingsScreen> {
  final _nameController = TextEditingController();
  final _legalNameController = TextEditingController();
  final _gstinController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressLine1Controller = TextEditingController();
  final _addressLine2Controller = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();
  final _pincodeController = TextEditingController();
  bool _prefilled = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _legalNameController.dispose();
    _gstinController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressLine1Controller.dispose();
    _addressLine2Controller.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _pincodeController.dispose();
    super.dispose();
  }

  void _prefillFrom(Organization org) {
    if (_prefilled) return;
    _prefilled = true;
    _nameController.text = org.name;
    _legalNameController.text = org.legalName ?? '';
    _gstinController.text = org.gstin ?? '';
    _phoneController.text = org.phone ?? '';
    _emailController.text = org.email ?? '';
    _addressLine1Controller.text = org.addressLine1 ?? '';
    _addressLine2Controller.text = org.addressLine2 ?? '';
    _cityController.text = org.city ?? '';
    _stateController.text = org.state ?? '';
    _pincodeController.text = org.pincode ?? '';
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.settingsManage) ?? false;
    final orgAsync = ref.watch(organizationProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Business profile')),
      body: orgAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (org) {
          _prefillFrom(org);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              if (!canEdit)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'Only an Owner can edit these details — you can view them here.',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                  ),
                ),
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
                          labelText: 'Restaurant / display name',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _legalNameController,
                        decoration: const InputDecoration(
                          labelText: 'Legal / registered business name (optional)',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _gstinController,
                        decoration: const InputDecoration(
                          labelText: 'GSTIN (optional)',
                          helperText:
                              'This organization\'s GST number. An outlet can have its own '
                              'separate GSTIN too — GST registration is state-wise in India.',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.characters,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _phoneController,
                              decoration: const InputDecoration(
                                labelText: 'Phone (optional)',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.phone,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _emailController,
                              decoration: const InputDecoration(
                                labelText: 'Email (optional)',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.emailAddress,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _addressLine1Controller,
                        decoration: const InputDecoration(
                          labelText: 'Address line 1 (optional)',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _addressLine2Controller,
                        decoration: const InputDecoration(
                          labelText: 'Address line 2 (optional)',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _cityController,
                              decoration: const InputDecoration(
                                labelText: 'City (optional)',
                                border: OutlineInputBorder(),
                              ),
                              textCapitalization: TextCapitalization.words,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _stateController,
                              decoration: const InputDecoration(
                                labelText: 'State (optional)',
                                border: OutlineInputBorder(),
                              ),
                              textCapitalization: TextCapitalization.words,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: _pincodeController,
                              decoration: const InputDecoration(
                                labelText: 'PIN (optional)',
                                border: OutlineInputBorder(),
                              ),
                              keyboardType: TextInputType.number,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      _ReadOnlyRow(country: org.country, currency: org.currency, timezone: org.timezone),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
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
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }
    // The backend validates email as a real address (@IsEmail()) whenever the field is present
    // at all — sending an empty string to "clear" it would fail that check, not clear it. So an
    // emptied field here is simply left out of the request rather than sent as ''.
    final email = _emailController.text.trim();

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(organizationRepositoryProvider)
          .updateMine(
            name: name,
            legalName: _legalNameController.text.trim(),
            gstin: _gstinController.text.trim(),
            phone: _phoneController.text.trim(),
            email: email.isEmpty ? null : email,
            addressLine1: _addressLine1Controller.text.trim(),
            addressLine2: _addressLine2Controller.text.trim(),
            city: _cityController.text.trim(),
            state: _stateController.text.trim(),
            pincode: _pincodeController.text.trim(),
          );
      ref.invalidate(organizationProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Business profile saved')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ReadOnlyRow extends StatelessWidget {
  const _ReadOnlyRow({required this.country, required this.currency, required this.timezone});

  final String country;
  final String currency;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.lock_outline, size: 16, color: Theme.of(context).colorScheme.outline),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Country $country · Currency $currency · Timezone $timezone — fixed in v1, not '
              'editable.',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
            ),
          ),
        ],
      ),
    );
  }
}
