/**
 * Talks to `services/api`'s guest-facing routes (`/qr/*`, `/qr/orders/*` — see
 * services/api/src/modules/qr and .../orders/orders-guest.controller.ts). Deliberately a thin
 * `fetch` wrapper, not a generated client: the guest surface is small (resolve, menu, place
 * order, get order), and a hand-rolled client keeps the bundle small for what's meant to be a
 * fast-loading page on a diner's own mobile data or the restaurant's guest Wi-Fi.
 */

// LAN-first (docs/architecture.md §1): the API server is a machine on the restaurant's own
// network, not a fixed cloud host. v1 ships a build-time default plus a Vite env override —
// see .env.example. A future slice can add QR-embedded server discovery so this never needs
// manual configuration at all.
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

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** The dining-session bearer token — omitted only for the initial `resolve` call. */
  sessionToken?: string;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.sessionToken) {
    headers.Authorization = `Bearer ${options.sessionToken}`;
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
      "Couldn't reach the restaurant's server. Check you're on their Wi-Fi and try again.",
    );
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
