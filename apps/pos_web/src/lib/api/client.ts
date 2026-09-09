/**
 * Talks to `services/api`'s staff routes (POS/Waiter entry points — `OrdersController`,
 * `TablesController`, `MenuController`, `BillingController`, `PaymentsController`; see
 * services/api/src/modules/*). A thin `fetch` wrapper, same choice
 * `apps/customer_web/src/lib/api/client.ts` made for the guest side, extended here with the
 * one thing staff auth actually needs that guest auth doesn't: an access-token refresh cycle
 * (access tokens are short-lived — `JWT_ACCESS_TTL=15m` in .env.example — so a staff member
 * mid-shift will routinely have their token expire without ever re-entering a password, unlike
 * a diner's one-sitting guest session).
 */
import { tokenStorage } from '../auth/token-storage';
import { isJwtExpired } from '../auth/jwt';

// LAN-first (docs/architecture.md §1), same convention as the customer web app's client.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  readonly statusCode?: number;
  readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Set by AuthContext on mount. Called whenever a request fails auth and can't be recovered by
 * a refresh (refresh token itself expired/revoked, or missing) — the client layer can't import
 * AuthContext directly (that would be circular: AuthContext depends on this module for its own
 * login/refresh calls), so this callback is how it reports "the session is dead, clear your
 * state and send the user back to /login" upward without a direct dependency.
 */
let onAuthFailure: (() => void) | undefined;
export function setAuthFailureHandler(handler: (() => void) | undefined): void {
  onAuthFailure = handler;
}

// Refresh calls are de-duplicated behind a single in-flight promise: if three requests all hit
// a 401 for the same expired token at once (e.g. a screen firing several fetches on mount),
// they should trigger exactly one POST /auth/refresh, not three racing ones that would each
// try to rotate the (single-use) refresh token and fail each other out.
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const stored = tokenStorage.read();
    if (!stored) throw new ApiError('No session to refresh.', 401);

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: stored.refreshToken }),
    });

    if (!response.ok) {
      tokenStorage.clear();
      throw new ApiError('Session expired. Please sign in again.', response.status);
    }

    const data = (await response.json()) as { accessToken: string; refreshToken: string };
    tokenStorage.write({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skips attaching/refreshing the bearer token — only /auth/login needs this; /auth/refresh
   * reads the refresh token itself and isn't routed through apiRequest at all (see above). */
  skipAuth?: boolean;
  /** Internal: set on the retried call after a refresh, so a second 401 gives up instead of
   * refreshing forever. */
  _isRetry?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (!options.skipAuth) {
    let stored = tokenStorage.read();
    if (stored && isJwtExpired(stored.accessToken) && !options._isRetry) {
      try {
        await refreshAccessToken();
        stored = tokenStorage.read();
      } catch {
        onAuthFailure?.();
        throw new ApiError('Session expired. Please sign in again.', 401);
      }
    }
    if (stored) headers.Authorization = `Bearer ${stored.accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Couldn't reach the restaurant's server. Check the network connection and try again.",
    );
  }

  // A proactive refresh above (token looked expired) can still race a server that considers it
  // valid a moment longer, or vice versa — a reactive 401 here is the fallback for that gap,
  // and for a token revoked server-side for reasons the client can't predict (e.g. an admin
  // force-logging-out a session). Only retried once (`_isRetry`), and never for the
  // login/refresh calls themselves (`skipAuth`).
  if (response.status === 401 && !options.skipAuth && !options._isRetry) {
    try {
      await refreshAccessToken();
    } catch {
      onAuthFailure?.();
      throw new ApiError('Session expired. Please sign in again.', 401);
    }
    return apiRequest<T>(path, { ...options, _isRetry: true });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    if (response.status === 401) onAuthFailure?.();
    const body = data as { message?: string; code?: string } | undefined;
    throw new ApiError(
      body?.message ?? `Request failed (${response.status}).`,
      response.status,
      body?.code,
    );
  }

  return data as T;
}

export function apiBaseUrl(): string {
  return API_BASE_URL;
}
