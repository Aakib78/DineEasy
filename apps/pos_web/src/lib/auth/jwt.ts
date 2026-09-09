/**
 * Minimal JWT payload decoder — no signature verification, deliberately. Verifying an access
 * token's signature is `services/api`'s job on every request (`JwtAuthGuard`); a client
 * reading its own already-issued token just needs the claims it was handed back, the same
 * trust boundary `apps/restaurant_app/lib/core/auth/jwt_decoder.dart` operates under (see that
 * file's sibling `access_token_claims.dart` for the reasoning this mirrors). Not pulling in a
 * `jwt-decode` dependency for something this small.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT: expected three dot-separated parts.');
  }
  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const json = atob(padded);
  return JSON.parse(json) as Record<string, unknown>;
}

/** True if the token's `exp` claim (seconds since epoch) is in the past, or missing/unparseable
 * (treated as expired — safer to force a refresh than to trust a token we can't read). A small
 * `skewSeconds` buffer avoids racing a token that's valid right now but expires mid-request. */
export function isJwtExpired(token: string, skewSeconds = 15): boolean {
  try {
    const payload = decodeJwtPayload(token);
    const exp = payload.exp;
    if (typeof exp !== 'number') return true;
    return Date.now() >= (exp - skewSeconds) * 1000;
  } catch {
    return true;
  }
}
