import 'dart:async';

import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Wraps a configured [Dio] instance for talking to `services/api`, handling:
///  - attaching `Authorization: Bearer <accessToken>` to every request that has one stored;
///  - on a 401 response, calling `POST /auth/refresh` once and retrying the original request
///    with the new token (refresh-token rotation per docs/authentication.md — the old refresh
///    token is revoked server-side the moment it's used, so this must never fire twice
///    concurrently for the same expired token; `_refreshInFlight` below is what prevents that
///    when several requests 401 at once, e.g. a screen firing 3 API calls on load);
///  - normalizing every failure into an [ApiException] so calling code never has to know Dio.
///
/// Deliberately has no knowledge of Riverpod or any particular auth state container — it takes
/// an [onSessionExpired] callback instead, invoked when the refresh itself fails (refresh token
/// revoked/expired), so whatever owns session state can react (clear it, route to login)
/// without this class depending on it. See lib/core/auth/auth_session.dart for the wiring.
class ApiClient {
  ApiClient({required TokenStorage tokenStorage, required this.onSessionExpired, Dio? dio})
    : _tokenStorage = tokenStorage,
      _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: AppConfig.apiBaseUrl,
              connectTimeout: AppConfig.requestTimeout,
              receiveTimeout: AppConfig.requestTimeout,
            ),
          ) {
    _dio.interceptors.add(
      InterceptorsWrapper(onRequest: _onRequest, onError: _onError),
    );
  }

  final TokenStorage _tokenStorage;
  final Dio _dio;

  /// Called when a refresh attempt fails — the session is unrecoverable and the caller should
  /// treat the user as logged out.
  final Future<void> Function() onSessionExpired;

  Future<void>? _refreshInFlight;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    // /auth/* endpoints are @Public() on the server and take no bearer token.
    if (!options.path.startsWith('/auth/')) {
      final tokens = await _tokenStorage.read();
      if (tokens != null) {
        options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
    }
    handler.next(options);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    final isUnauthorized = error.response?.statusCode == 401;
    final alreadyRetried = error.requestOptions.extra['dineeasyRetried'] == true;
    final isAuthEndpoint = error.requestOptions.path.startsWith('/auth/');

    if (!isUnauthorized || alreadyRetried || isAuthEndpoint) {
      return handler.next(error);
    }

    try {
      await _refreshTokenOnce();
    } catch (_) {
      await onSessionExpired();
      return handler.next(error);
    }

    try {
      final tokens = await _tokenStorage.read();
      final retryOptions = error.requestOptions;
      retryOptions.extra['dineeasyRetried'] = true;
      if (tokens != null) {
        retryOptions.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      }
      final response = await _dio.fetch<dynamic>(retryOptions);
      return handler.resolve(response);
    } on DioException catch (retryError) {
      return handler.next(retryError);
    }
  }

  /// Coalesces concurrent refresh attempts into one in-flight call, so if three requests 401
  /// at the same moment only one `/auth/refresh` call actually goes out (the rotating-refresh-
  /// token contract means a second concurrent call would be refreshing an already-revoked
  /// token and would fail).
  Future<void> _refreshTokenOnce() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() => _refreshInFlight = null);
  }

  Future<void> _doRefresh() async {
    final current = await _tokenStorage.read();
    if (current == null) throw const ApiException(message: 'No session to refresh.');

    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/refresh',
      data: {'refreshToken': current.refreshToken},
    );
    final data = response.data!;
    await _tokenStorage.write(
      StoredTokenPair(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
      ),
    );
  }

  /// Raw access for repositories that need it; every call still goes through the interceptors
  /// above. Repositories should catch [DioException] and rethrow via [ApiException.fromDioException]
  /// unless they need to inspect the raw error (rare — see AuthRepository.login for the one
  /// deliberate exception, where a 401 has a specific "wrong password" meaning rather than
  /// "session expired").
  Dio get dio => _dio;
}
