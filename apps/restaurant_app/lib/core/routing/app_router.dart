import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_session.dart';
import '../../features/auth/login_screen.dart';
import '../../features/home/home_shell.dart';
import '../../features/home/splash_screen.dart';

/// Bridges Riverpod's `authSessionProvider` to go_router's `refreshListenable`, so a login,
/// logout, or forced session-expiry immediately re-runs the redirect logic below rather than
/// waiting for the next manual navigation. See https://pub.dev/packages/go_router "Refresh"
/// docs for the pattern this follows.
class _RouterRefreshNotifier extends ChangeNotifier {
  _RouterRefreshNotifier(Ref ref) {
    ref.listen<AuthSessionState>(authSessionProvider, (previous, next) => notifyListeners());
  }
}

final _routerRefreshProvider = Provider<_RouterRefreshNotifier>((ref) {
  final notifier = _RouterRefreshNotifier(ref);
  ref.onDispose(notifier.dispose);
  return notifier;
});

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: ref.watch(_routerRefreshProvider),
    redirect: (context, routerState) {
      final session = ref.read(authSessionProvider);
      final isOnSplash = routerState.matchedLocation == '/splash';
      final isOnLogin = routerState.matchedLocation == '/login';

      switch (session) {
        case AuthSessionUnknown():
          // Still checking for a stored session — let /splash render, don't redirect anything
          // else yet (avoids a login-screen flash on a cold start that turns out authenticated).
          return isOnSplash ? null : '/splash';
        case AuthSessionAuthenticating():
        case AuthSessionUnauthenticated():
          return isOnLogin ? null : '/login';
        case AuthSessionAuthenticated():
          return (isOnSplash || isOnLogin) ? '/home' : null;
      }
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/home', builder: (context, state) => const HomeShell()),
    ],
  );
});
