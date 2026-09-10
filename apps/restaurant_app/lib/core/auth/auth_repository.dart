import 'package:dio/dio.dart';

import '../network/api_client.dart';
import '../network/api_exception.dart';
import '../storage/token_storage.dart';
import 'access_token_claims.dart';
import 'jwt_decoder.dart';

/// Talks to `AuthController` (`services/api/src/modules/auth`). Every method here either
/// returns fresh [AccessTokenClaims] (decoded from the new access token — see AccessTokenClaims
/// for why decoding without server-side verification is safe here) or throws [ApiException].
class AuthRepository {
  AuthRepository({required ApiClient apiClient, required TokenStorage tokenStorage})
    : _apiClient = apiClient,
      _tokenStorage = tokenStorage;

  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;

  /// `POST /auth/register` (`@Public()`) — spec §68 step 1, "restaurant owner creates account".
  /// Creates a brand-new Organization + Owner user in one backend transaction and, like login,
  /// returns a token pair directly: registering *is* signing in, no separate login call needed.
  /// The returned claims' `activeOutletId` is always null here — a fresh organization has zero
  /// outlets yet (`AuthService.register` deliberately doesn't create one), so the caller is
  /// expected to route straight into outlet-creation onboarding rather than the normal app
  /// shell. See `features/outlets/create_outlet_screen.dart`.
  Future<AccessTokenClaims> register({
    required String organizationName,
    required String ownerName,
    required String ownerEmail,
    required String password,
    String? phone,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/auth/register',
        data: {
          'organizationName': organizationName,
          'ownerName': ownerName,
          'ownerEmail': ownerEmail,
          'password': password,
          if (phone != null && phone.isNotEmpty) 'phone': phone,
        },
      );
      return _persistAndDecode(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// [deviceInfo] is a free-text label like "POS-Counter-1 / Android" — stored server-side on
  /// the refresh token for session visibility (spec §21), not used for anything client-side.
  Future<AccessTokenClaims> login({
    required String email,
    required String password,
    String? deviceInfo,
  }) async {
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/auth/login',
        data: {'email': email, 'password': password, if (deviceInfo != null) 'deviceInfo': deviceInfo},
      );
      return _persistAndDecode(response.data!);
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    }
  }

  /// Called on app start if a token pair is already stored, to get current claims without
  /// forcing a fresh login. If the stored access token is still valid this just decodes it
  /// locally; if it's expired (or close to it) this proactively refreshes first, so the app
  /// doesn't start already one request away from a 401.
  Future<AccessTokenClaims?> restoreSession() async {
    final tokens = await _tokenStorage.read();
    if (tokens == null) return null;

    try {
      if (JwtDecoder.isExpired(tokens.accessToken)) {
        return await refresh();
      }
      return AccessTokenClaims.fromToken(tokens.accessToken);
    } catch (_) {
      // Anything unexpected about the stored token (corrupt, unparseable) — treat as no
      // session rather than crashing app start.
      await _tokenStorage.clear();
      return null;
    }
  }

  Future<AccessTokenClaims> refresh() async {
    final tokens = await _tokenStorage.read();
    if (tokens == null) {
      throw const ApiException(message: 'No session to refresh.');
    }
    try {
      final response = await _apiClient.dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': tokens.refreshToken},
      );
      return _persistAndDecode(response.data!);
    } on DioException catch (e) {
      await _tokenStorage.clear();
      throw ApiException.fromDioException(e);
    }
  }

  Future<void> logout() async {
    final tokens = await _tokenStorage.read();
    await _tokenStorage.clear();
    if (tokens == null) return;
    try {
      // Best-effort: revoke server-side, but the local session is gone either way — a
      // restaurant's LAN can drop mid-logout and the staff member still expects to be signed
      // out locally immediately.
      await _apiClient.dio.post<void>('/auth/logout', data: {'refreshToken': tokens.refreshToken});
    } on DioException {
      // Ignored deliberately — see above.
    }
  }

  Future<AccessTokenClaims> _persistAndDecode(Map<String, dynamic> tokenPairJson) async {
    final tokens = StoredTokenPair(
      accessToken: tokenPairJson['accessToken'] as String,
      refreshToken: tokenPairJson['refreshToken'] as String,
    );
    await _tokenStorage.write(tokens);
    return AccessTokenClaims.fromToken(tokens.accessToken);
  }
}
