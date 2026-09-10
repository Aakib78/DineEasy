import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_client.dart';
import '../network/api_exception.dart';
import '../storage/token_storage.dart';
import 'access_token_claims.dart';
import 'auth_repository.dart';

sealed class AuthSessionState extends Equatable {
  const AuthSessionState();

  @override
  List<Object?> get props => [];
}

/// App just started; we haven't yet checked whether a stored session exists.
class AuthSessionUnknown extends AuthSessionState {
  const AuthSessionUnknown();
}

class AuthSessionUnauthenticated extends AuthSessionState {
  const AuthSessionUnauthenticated({this.error});

  /// Set right after a failed login attempt, so the login screen can show why. Not set for
  /// the ordinary "app just started, no stored session" case.
  final String? error;

  @override
  List<Object?> get props => [error];
}

class AuthSessionAuthenticating extends AuthSessionState {
  const AuthSessionAuthenticating();
}

class AuthSessionAuthenticated extends AuthSessionState {
  const AuthSessionAuthenticated(this.claims);

  final AccessTokenClaims claims;

  @override
  List<Object?> get props => [claims];
}

/// Owns the app's single source of truth for "who is signed in, with what permissions" and
/// drives the router's auth redirect (see lib/core/routing/app_router.dart). Every screen that
/// needs the current user reads `ref.watch(authSessionProvider)` rather than holding its own
/// copy, so a logout or a token refresh is instantly visible everywhere.
class AuthSessionNotifier extends StateNotifier<AuthSessionState> {
  AuthSessionNotifier({required TokenStorage tokenStorage, ApiClient? apiClientOverride})
    : _tokenStorage = tokenStorage,
      super(const AuthSessionUnknown()) {
    _apiClient =
        apiClientOverride ??
        ApiClient(tokenStorage: tokenStorage, onSessionExpired: _handleSessionExpired);
    _authRepository = AuthRepository(apiClient: _apiClient, tokenStorage: tokenStorage);
  }

  final TokenStorage _tokenStorage;
  late final ApiClient _apiClient;
  late final AuthRepository _authRepository;

  ApiClient get apiClient => _apiClient;

  /// Call once at app start.
  Future<void> restore() async {
    final claims = await _authRepository.restoreSession();
    state = claims != null
        ? AuthSessionAuthenticated(claims)
        : const AuthSessionUnauthenticated();
  }

  Future<void> login({required String email, required String password}) async {
    state = const AuthSessionAuthenticating();
    try {
      final claims = await _authRepository.login(
        email: email,
        password: password,
        deviceInfo: 'DineEasy Staff App',
      );
      state = AuthSessionAuthenticated(claims);
    } on ApiException catch (e) {
      state = AuthSessionUnauthenticated(error: e.message);
    }
  }

  /// Register a brand-new organization + owner account. Success is auto-login (mirrors
  /// [login]) — the register screen never sends the new owner to a separate sign-in step. A
  /// failure (e.g. a duplicate org name isn't actually rejected server-side, but a malformed
  /// field is) surfaces the same way a failed login does, via `AuthSessionUnauthenticated.error`.
  Future<void> register({
    required String organizationName,
    required String ownerName,
    required String ownerEmail,
    required String password,
    String? phone,
  }) async {
    state = const AuthSessionAuthenticating();
    try {
      final claims = await _authRepository.register(
        organizationName: organizationName,
        ownerName: ownerName,
        ownerEmail: ownerEmail,
        password: password,
        phone: phone,
      );
      state = AuthSessionAuthenticated(claims);
    } on ApiException catch (e) {
      state = AuthSessionUnauthenticated(error: e.message);
    }
  }

  /// Re-issues a token pair against the currently-stored refresh token and updates [state] with
  /// the newly-decoded claims — used right after the fresh-owner onboarding flow creates the
  /// organization's first outlet, since `activeOutletId` in the *current* access token was
  /// minted before that outlet existed (`AuthService.resolveActiveOutlet` only auto-picks when
  /// exactly one outlet exists at token-issue time) and won't update on its own before the next
  /// natural refresh. Deliberately distinct from the silent, automatic refresh
  /// `ApiClient`'s interceptor performs on a 401 — this one is a caller-driven "go get me a
  /// fresher token right now" used outside any failed-request context.
  Future<void> refreshClaims() async {
    try {
      final claims = await _authRepository.refresh();
      state = AuthSessionAuthenticated(claims);
    } on ApiException catch (e) {
      state = AuthSessionUnauthenticated(error: e.message);
    }
  }

  Future<void> logout() async {
    await _authRepository.logout();
    state = const AuthSessionUnauthenticated();
  }

  /// Wired into ApiClient — fires when a refresh-token-backed retry fails (the refresh token
  /// itself is invalid/expired/revoked), meaning the session cannot be silently repaired and
  /// the user must sign in again.
  Future<void> _handleSessionExpired() async {
    await _tokenStorage.clear();
    state = const AuthSessionUnauthenticated(
      error: 'Your session expired. Please sign in again.',
    );
  }
}

final tokenStorageProvider = Provider<TokenStorage>((ref) => SecureTokenStorage());

final authSessionProvider = StateNotifierProvider<AuthSessionNotifier, AuthSessionState>((ref) {
  return AuthSessionNotifier(tokenStorage: ref.watch(tokenStorageProvider));
});

/// Convenience provider for the current claims, or null when signed out — most feature screens
/// only need this, not the full session-state machine.
final currentUserProvider = Provider<AccessTokenClaims?>((ref) {
  final session = ref.watch(authSessionProvider);
  return session is AuthSessionAuthenticated ? session.claims : null;
});

/// The shared, auth-aware Dio client — every repository (Orders, Tables, Kitchen, ...) should
/// depend on this rather than constructing its own Dio, so token attachment and refresh-and-
/// retry are consistent everywhere.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ref.watch(authSessionProvider.notifier).apiClient;
});
