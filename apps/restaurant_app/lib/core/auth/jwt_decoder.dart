import 'dart:convert';

/// Decodes the payload segment of a JWT without verifying its signature.
///
/// This is deliberately *not* a security check — the app never trusts an access token it
/// didn't just receive from `services/api` over a request it made itself, and every API call
/// still gets re-validated server-side (`JwtAuthGuard`/`PermissionsGuard`, see
/// docs/authentication.md). Decoding here is purely so the UI can read claims — name, email,
/// permissions, activeOutletId — without a separate "who am I" endpoint (the backend doesn't
/// expose one; see AuthController). If the token is ever tampered with in transit, every
/// subsequent API call using it simply fails with 401, same as any other invalid token.
class JwtDecoder {
  const JwtDecoder._();

  static Map<String, dynamic> decodePayload(String token) {
    final parts = token.split('.');
    if (parts.length != 3) {
      throw const FormatException('Not a JWT: expected 3 dot-separated segments');
    }
    final normalized = base64Url.normalize(parts[1]);
    final decoded = utf8.decode(base64Url.decode(normalized));
    final json = jsonDecode(decoded);
    if (json is! Map<String, dynamic>) {
      throw const FormatException('JWT payload is not a JSON object');
    }
    return json;
  }

  /// Best-effort expiry check using the standard `exp` claim (seconds since epoch), if present.
  /// Used to proactively refresh before a request would otherwise 401 — see AuthRepository.
  static bool isExpired(String token, {Duration leeway = const Duration(seconds: 30)}) {
    final payload = decodePayload(token);
    final exp = payload['exp'];
    if (exp is! int) return false; // no exp claim -> can't judge, assume still valid
    final expiry = DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true);
    return DateTime.now().toUtc().isAfter(expiry.subtract(leeway));
  }
}
