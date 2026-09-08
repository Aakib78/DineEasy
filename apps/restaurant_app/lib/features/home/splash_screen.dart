import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';

/// Shown for the brief moment between app start and knowing whether a stored session exists
/// (see AuthSessionNotifier.restore, called once from main.dart before the first frame that
/// matters). Kept intentionally simple — this is a loading gate, not a branding opportunity.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // Deferred to after the first frame so the router has already mounted this screen before
    // restore() potentially triggers an immediate redirect.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(authSessionProvider.notifier).restore());
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
