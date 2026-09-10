import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/rbac/permissions.dart';
import 'data/outlet_models.dart';
import 'state/outlet_providers.dart';

/// `GET`/`PATCH /outlets/:id` (`OutletsController`) existed with no UI anywhere beyond the
/// name-only dropdown `StaffScreen` uses to assign a role — the only way to set this outlet's
/// own address, GSTIN, FSSAI license, or service-charge percentage was a raw API call. Reached
/// via Settings' "Outlet settings" entry, one screen below Business profile: that screen edits
/// the *organization* (the legal entity, possibly spanning several outlets); this one edits the
/// *outlet* the signed-in user is currently working at — distinct rows, distinct fields, per
/// `docs/architecture.md`'s note on why a chain's GSTIN is state-wise, outlet by outlet.
///
/// Notably, `gstin`/`fssaiLicense`/`name`/address here are exactly the fields
/// `BillingService.buildReceiptPayload` started printing on every receipt this session (see
/// `docs/printing.md`'s "Receipt header" section) — until this screen existed, nothing let staff
/// actually set the values that show up on a customer's bill.
///
/// Viewing has no permission gate server-side (any signed-in user can read their own outlet's
/// settings), so every role reaches this screen; editing is `settings.manage`-gated (Owner only
/// among the system roles) — same `AbsorbPointer`-dims-the-form pattern
/// `OrganizationSettingsScreen`/`TaxGroupsScreen`'s edit sheet use.
class OutletSettingsScreen extends ConsumerStatefulWidget {
  const OutletSettingsScreen({super.key});

  @override
  ConsumerState<OutletSettingsScreen> createState() => _OutletSettingsScreenState();
}

class _OutletSettingsScreenState extends ConsumerState<OutletSettingsScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressLine1Controller = TextEditingController();
  final _addressLine2Controller = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();
  final _pincodeController = TextEditingController();
  final _gstinController = TextEditingController();
  final _fssaiController = TextEditingController();
  final _serviceChargeController = TextEditingController();
  bool _roundOffEnabled = true;
  bool _prefilled = false;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _addressLine1Controller.dispose();
    _addressLine2Controller.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _pincodeController.dispose();
    _gstinController.dispose();
    _fssaiController.dispose();
    _serviceChargeController.dispose();
    super.dispose();
  }

  void _prefillFrom(Outlet outlet) {
    if (_prefilled) return;
    _prefilled = true;
    _nameController.text = outlet.name;
    _phoneController.text = outlet.phone ?? '';
    _addressLine1Controller.text = outlet.addressLine1 ?? '';
    _addressLine2Controller.text = outlet.addressLine2 ?? '';
    _cityController.text = outlet.city ?? '';
    _stateController.text = outlet.state ?? '';
    _pincodeController.text = outlet.pincode ?? '';
    _gstinController.text = outlet.gstin ?? '';
    _fssaiController.text = outlet.fssaiLicense ?? '';
    _serviceChargeController.text = outlet.serviceChargePercent;
    _roundOffEnabled = outlet.roundOffEnabled;
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final canEdit = user?.hasPermission(Permissions.settingsManage) ?? false;
    final outletAsync = ref.watch(outletProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Outlet settings')),
      body: outletAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
        data: (outlet) {
          _prefillFrom(outlet);
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
                          labelText: 'Outlet name',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
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
                      const SizedBox(height: 12),
                      TextField(
                        controller: _gstinController,
                        decoration: const InputDecoration(
                          labelText: 'GSTIN (optional)',
                          helperText:
                              "This outlet's own GST number — printed on every receipt "
                              'generated here. GST registration is state-wise in India, so this '
                              "can differ from the organization's own GSTIN.",
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.characters,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _fssaiController,
                        decoration: const InputDecoration(
                          labelText: 'FSSAI license number (optional)',
                          helperText: 'Also printed on every receipt generated at this outlet.',
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _serviceChargeController,
                        decoration: const InputDecoration(
                          labelText: 'Service charge %',
                          helperText:
                              'Applied to every order placed at this outlet — 0 to disable it '
                              'entirely.',
                          border: OutlineInputBorder(),
                        ),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                      const SizedBox(height: 4),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Round off totals'),
                        subtitle: const Text(
                          "Rounds each order's final total to the nearest rupee.",
                        ),
                        value: _roundOffEnabled,
                        onChanged: canEdit ? (v) => setState(() => _roundOffEnabled = v) : null,
                      ),
                      const SizedBox(height: 12),
                      _ReadOnlyRow(code: outlet.code, timezone: outlet.timezone),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ],
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _submitting ? null : () => _submit(outlet.id),
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

  Future<void> _submit(String outletId) async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Enter a name.');
      return;
    }

    final serviceChargeText = _serviceChargeController.text.trim();
    final serviceCharge = serviceChargeText.isEmpty ? 0.0 : double.tryParse(serviceChargeText);
    if (serviceCharge == null || serviceCharge < 0 || serviceCharge > 100) {
      setState(() => _error = 'Enter a valid service charge percentage (0–100).');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(outletRepositoryProvider)
          .update(
            outletId,
            name: name,
            phone: _phoneController.text.trim(),
            addressLine1: _addressLine1Controller.text.trim(),
            addressLine2: _addressLine2Controller.text.trim(),
            city: _cityController.text.trim(),
            state: _stateController.text.trim(),
            pincode: _pincodeController.text.trim(),
            gstin: _gstinController.text.trim(),
            fssaiLicense: _fssaiController.text.trim(),
            serviceChargePercent: serviceCharge,
            roundOffEnabled: _roundOffEnabled,
          );
      ref.invalidate(outletProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Outlet settings saved')));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

class _ReadOnlyRow extends StatelessWidget {
  const _ReadOnlyRow({required this.code, required this.timezone});

  final String code;
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
              'Code $code · Timezone $timezone — fixed after creation, not editable here.',
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
