import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A stored access/refresh token pair. Mirrors `TokenPair` in
/// `services/api/src/modules/auth/auth.service.ts`.
class StoredTokenPair {
  const StoredTokenPair({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}

/// OS-keychain-backed token persistence (spec §21: tokens are bearer credentials and must be
/// stored like passwords, never in plain SharedPreferences/localStorage-equivalents). Kept
/// behind an interface so tests can substitute an in-memory fake without touching a real
/// keychain — see test/core/auth for usage.
abstract class TokenStorage {
  Future<StoredTokenPair?> read();
  Future<void> write(StoredTokenPair tokens);
  Future<void> clear();
}

class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _accessKey = 'dineeasy.access_token';
  static const _refreshKey = 'dineeasy.refresh_token';

  @override
  Future<StoredTokenPair?> read() async {
    final access = await _storage.read(key: _accessKey);
    final refresh = await _storage.read(key: _refreshKey);
    if (access == null || refresh == null) return null;
    return StoredTokenPair(accessToken: access, refreshToken: refresh);
  }

  @override
  Future<void> write(StoredTokenPair tokens) async {
    await _storage.write(key: _accessKey, value: tokens.accessToken);
    await _storage.write(key: _refreshKey, value: tokens.refreshToken);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

/// In-memory implementation for widget/unit tests — no platform channel, so it runs under
/// plain `flutter test`/`dart test` without a device or keychain.
class InMemoryTokenStorage implements TokenStorage {
  StoredTokenPair? _tokens;

  @override
  Future<StoredTokenPair?> read() async => _tokens;

  @override
  Future<void> write(StoredTokenPair tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}
