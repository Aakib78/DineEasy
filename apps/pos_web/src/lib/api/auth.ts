import { apiRequest } from './client';
import { tokenStorage } from '../auth/token-storage';

interface TokenPairResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** `deviceInfo` is a free-text label stored server-side on the refresh token for session
 * visibility (spec §21) — "POS-Counter-1 / Chrome" rather than nothing, so a manager looking
 * at active sessions later can tell terminals apart. Not used for anything client-side. */
export async function login(email: string, password: string): Promise<string> {
  const deviceInfo = `POS Web / ${navigator.userAgent.split(') ')[0].replace(/^.*\(/, '') || 'browser'}`;
  const tokens = await apiRequest<TokenPairResponse>('/auth/login', {
    method: 'POST',
    body: { email, password, deviceInfo },
    skipAuth: true,
  });
  tokenStorage.write({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  return tokens.accessToken;
}

export async function logout(): Promise<void> {
  const stored = tokenStorage.read();
  tokenStorage.clear();
  if (!stored) return;
  try {
    // Best-effort: revoke server-side, but the local session is cleared either way — a
    // restaurant's LAN can drop mid-logout and staff still expect to be signed out locally.
    await apiRequest<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken: stored.refreshToken },
      skipAuth: true,
    });
  } catch {
    // Ignored deliberately — see above.
  }
}
