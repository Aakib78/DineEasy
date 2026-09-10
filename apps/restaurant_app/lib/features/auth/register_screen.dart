import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_session.dart';

/// `POST /auth/register` (`AuthController`, `@Public()`) existed from early in the project —
/// spec §68 step 1, "restaurant owner creates account" — but no UI anywhere ever called it; the
/// only way for a new restaurant to get onto the platform at all was a raw API call from
/// someone with API access, which obviously isn't how a real owner signs up. This screen closes
/// that gap: reached from `LoginScreen`'s new "Create one" link, mirrors its layout (same brand
/// gradient/card), and — since `AuthService.register` returns a token pair directly, exactly
/// like login does — success here *is* being signed in, no separate sign-in step after.
///
/// A fresh organization has zero outlets (`AuthService.register` deliberately doesn't create
/// one — that's a distinct step, spec §68 step 2), so `AuthSessionAuthenticated.claims
/// .activeOutletId` is always null right after this succeeds. `app_router.dart` still sends
/// that state to `/home`, same as any authenticated session; `HomeShell`'s existing
/// "not assigned to an outlet" screen is what then offers a fresh Owner (recognized by holding
/// `settings.manage` org-wide, per that screen's own doc comment) a "Create your first outlet"
/// path into `CreateOutletScreen` rather than dead-ending on "ask your manager", which made no
/// sense for someone who just registered as the owner.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _organizationNameController = TextEditingController();
  final _ownerNameController = TextEditingController();
  final _ownerEmailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _organizationNameController.dispose();
    _ownerNameController.dispose();
    _ownerEmailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    ref
        .read(authSessionProvider.notifier)
        .register(
          organizationName: _organizationNameController.text.trim(),
          ownerName: _ownerNameController.text.trim(),
          ownerEmail: _ownerEmailController.text.trim(),
          password: _passwordController.text,
          phone: _phoneController.text.trim(),
        );
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authSessionProvider);
    final isAuthenticating = session is AuthSessionAuthenticating;
    final error = session is AuthSessionUnauthenticated ? session.error : null;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [colorScheme.primary, colorScheme.tertiary],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(
                    radius: 32,
                    backgroundColor: colorScheme.onPrimary,
                    child: Icon(Icons.storefront, size: 32, color: colorScheme.primary),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Set up your restaurant',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: colorScheme.onPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Create your account — you'll add your outlet's details next",
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(color: colorScheme.onPrimary.withOpacity(0.9)),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 28),
                  Card(
                    elevation: 8,
                    shadowColor: Colors.black.withOpacity(0.3),
                    color: colorScheme.surface,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (error != null) ...[
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: colorScheme.errorContainer,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  error,
                                  style: TextStyle(color: colorScheme.onErrorContainer),
                                ),
                              ),
                              const SizedBox(height: 16),
                            ],
                            TextFormField(
                              controller: _organizationNameController,
                              enabled: !isAuthenticating,
                              textCapitalization: TextCapitalization.words,
                              textInputAction: TextInputAction.next,
                              decoration: const InputDecoration(
                                labelText: 'Restaurant / business name',
                                helperText: 'The legal entity — you can add outlets under it next',
                                prefixIcon: Icon(Icons.business_outlined),
                              ),
                              validator: (value) {
                                final v = value?.trim() ?? '';
                                if (v.isEmpty) return 'Enter your restaurant name';
                                if (v.length < 2) return 'Must be at least 2 characters';
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _ownerNameController,
                              enabled: !isAuthenticating,
                              textCapitalization: TextCapitalization.words,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.name],
                              decoration: const InputDecoration(
                                labelText: 'Your name',
                                prefixIcon: Icon(Icons.person_outline),
                              ),
                              validator: (value) {
                                final v = value?.trim() ?? '';
                                if (v.isEmpty) return 'Enter your name';
                                if (v.length < 2) return 'Must be at least 2 characters';
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _ownerEmailController,
                              enabled: !isAuthenticating,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.email],
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                helperText: "You'll sign in with this",
                                prefixIcon: Icon(Icons.mail_outline),
                              ),
                              validator: (value) {
                                final v = value?.trim() ?? '';
                                if (v.isEmpty) return 'Enter your email';
                                if (!v.contains('@')) return 'Enter a valid email';
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _phoneController,
                              enabled: !isAuthenticating,
                              keyboardType: TextInputType.phone,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.telephoneNumber],
                              decoration: const InputDecoration(
                                labelText: 'Phone (optional)',
                                prefixIcon: Icon(Icons.call_outlined),
                              ),
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _passwordController,
                              enabled: !isAuthenticating,
                              obscureText: _obscurePassword,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.newPassword],
                              decoration: InputDecoration(
                                labelText: 'Password',
                                helperText: 'At least 8 characters',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  icon: Icon(_obscurePassword ? Icons.visibility : Icons.visibility_off),
                                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                                ),
                              ),
                              validator: (value) {
                                final v = value ?? '';
                                if (v.isEmpty) return 'Enter a password';
                                if (v.length < 8) return 'Must be at least 8 characters';
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _confirmPasswordController,
                              enabled: !isAuthenticating,
                              obscureText: _obscurePassword,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _submit(),
                              decoration: const InputDecoration(
                                labelText: 'Confirm password',
                                prefixIcon: Icon(Icons.lock_outline),
                              ),
                              validator: (value) {
                                if (value != _passwordController.text) return "Passwords don't match";
                                return null;
                              },
                            ),
                            const SizedBox(height: 24),
                            FilledButton(
                              onPressed: isAuthenticating ? null : _submit,
                              child: isAuthenticating
                                  ? SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: colorScheme.onPrimary,
                                      ),
                                    )
                                  : const Text('Create account'),
                            ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: isAuthenticating ? null : () => context.go('/login'),
                              child: const Text('Already have an account? Sign in'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
