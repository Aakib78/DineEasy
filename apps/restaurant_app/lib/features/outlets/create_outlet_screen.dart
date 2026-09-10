import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import 'state/outlet_providers.dart';

/// `POST /outlets` (`OutletsController.create`) existed with a real `CreateOutletDto` but the
/// only UI anywhere near it was `OutletSettingsScreen`'s `PATCH` (edit an *existing* outlet).
/// There was never a way to create the very first one — a brand-new owner who'd just registered
/// (`RegisterScreen`) hit `HomeShell`'s "you're not assigned to an outlet" dead end with no path
/// forward except asking a manager who, for a fresh organization, doesn't exist yet.
///
/// Reached from `HomeShell`'s `_NoOutletAssignedScreen` (only offered there to a user holding
/// `settings.manage` with zero outlets in their organization — see that screen's doc comment),
/// pushed as a normal route rather than added to `app_router.dart`'s top-level routes, since
/// it's conditional UI inside an already-authenticated screen, not a distinct auth state.
///
/// After a successful create, the signed-in user's *current* access token still has
/// `activeOutletId: null` — it was minted before this outlet existed
/// (`AuthService.resolveActiveOutlet` only auto-picks an outlet at token-issue time). Calling
/// `AuthSessionNotifier.refreshClaims()` re-mints a token pair against the now-one-outlet
/// organization, which `resolveActiveOutlet` auto-selects — see that method's doc comment on
/// the "exactly one outlet" heuristic. That's what actually unblocks `HomeShell` afterward, not
/// anything this screen does with navigation directly.
class CreateOutletScreen extends ConsumerStatefulWidget {
  const CreateOutletScreen({super.key});

  @override
  ConsumerState<CreateOutletScreen> createState() => _CreateOutletScreenState();
}

class _CreateOutletScreenState extends ConsumerState<CreateOutletScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _codeController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressLine1Controller = TextEditingController();
  final _addressLine2Controller = TextEditingController();
  final _cityController = TextEditingController();
  final _stateController = TextEditingController();
  final _pincodeController = TextEditingController();
  final _gstinController = TextEditingController();
  final _fssaiController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _phoneController.dispose();
    _addressLine1Controller.dispose();
    _addressLine2Controller.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _pincodeController.dispose();
    _gstinController.dispose();
    _fssaiController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref
          .read(outletRepositoryProvider)
          .create(
            name: _nameController.text.trim(),
            code: _codeController.text.trim(),
            phone: _phoneController.text.trim(),
            addressLine1: _addressLine1Controller.text.trim(),
            addressLine2: _addressLine2Controller.text.trim(),
            city: _cityController.text.trim(),
            state: _stateController.text.trim(),
            pincode: _pincodeController.text.trim(),
            gstin: _gstinController.text.trim(),
            fssaiLicense: _fssaiController.text.trim(),
          );
      // Re-mint the access token now that the org has exactly one outlet — this is what
      // actually clears HomeShell's "no outlet assigned" screen, not the pop below.
      await ref.read(authSessionProvider.notifier).refreshClaims();
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create your outlet')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Text(
            "This is the actual restaurant location staff will work at — its own address, "
            'GSTIN, and FSSAI license print on every receipt generated here.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
          ),
          const SizedBox(height: 16),
          Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _nameController,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'Outlet name',
                    border: OutlineInputBorder(),
                  ),
                  textCapitalization: TextCapitalization.words,
                  validator: (value) {
                    final v = value?.trim() ?? '';
                    if (v.isEmpty) return 'Enter an outlet name';
                    if (v.length < 2) return 'Must be at least 2 characters';
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _codeController,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'Outlet code',
                    helperText:
                        'A short identifier, e.g. "MAIN" — fixed once created, not editable '
                        'later.',
                    border: OutlineInputBorder(),
                  ),
                  textCapitalization: TextCapitalization.characters,
                  validator: (value) {
                    final v = value?.trim() ?? '';
                    if (v.isEmpty) return 'Enter an outlet code';
                    if (v.length < 2) return 'Must be at least 2 characters';
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _phoneController,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'Phone (optional)',
                    border: OutlineInputBorder(),
                  ),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _addressLine1Controller,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'Address line 1 (optional)',
                    border: OutlineInputBorder(),
                  ),
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _addressLine2Controller,
                  enabled: !_submitting,
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
                      child: TextFormField(
                        controller: _cityController,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                          labelText: 'City (optional)',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _stateController,
                        enabled: !_submitting,
                        decoration: const InputDecoration(
                          labelText: 'State (optional)',
                          border: OutlineInputBorder(),
                        ),
                        textCapitalization: TextCapitalization.words,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _pincodeController,
                        enabled: !_submitting,
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
                TextFormField(
                  controller: _gstinController,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'GSTIN (optional)',
                    helperText: 'Printed on every receipt generated at this outlet.',
                    border: OutlineInputBorder(),
                  ),
                  textCapitalization: TextCapitalization.characters,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _fssaiController,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'FSSAI license number (optional)',
                    helperText: 'Also printed on every receipt.',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 16),
                Text(
                  'Address, GSTIN, and FSSAI license can all be changed later from Settings → '
                  'Outlet settings.',
                  style: Theme.of(
                    context,
                  ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.outline),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: Text(_submitting ? 'Creating…' : 'Create outlet'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
