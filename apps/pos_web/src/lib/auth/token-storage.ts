const STORAGE_KEY = 'dineeasy.pos.tokens';

export interface StoredTokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * `localStorage`, not `sessionStorage` — unlike the guest QR app's per-tab dining session
 * (`apps/customer_web/src/lib/session/SessionContext.tsx`), a POS terminal is a shared browser
 * tab left open on a counter machine through a whole shift (often across an accidental reload
 * or the browser itself restarting). A staff member re-entering their password every time a
 * tab refreshes would be a real friction point at a busy counter, so the session persists
 * across reloads and, deliberately, across the tab closing too — the same reasoning
 * `apps/restaurant_app/lib/core/storage/token_storage.dart` uses `flutter_secure_storage` for.
 * A shared physical terminal is a real tradeoff either way; explicit "Log out" (see
 * AuthContext's `logout`) is how a shift change actually happens in practice.
 */
export const tokenStorage = {
  read(): StoredTokenPair | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredTokenPair>;
      if (typeof parsed.accessToken !== 'string' || typeof parsed.refreshToken !== 'string') {
        return null;
      }
      return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    } catch {
      return null;
    }
  },

  write(tokens: StoredTokenPair): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch {
      // Storage full/unavailable (private browsing) — the session still works in-memory for
      // this page load via AuthContext's React state, it just won't survive a reload.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage was never writable in the first place.
    }
  },
};
