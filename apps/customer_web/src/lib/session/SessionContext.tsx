import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ResolveQrResponse } from '../api/types';

const STORAGE_KEY = 'dineeasy.session';

export type DiningSession = ResolveQrResponse;

function loadInitialSession(): DiningSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DiningSession) : null;
  } catch {
    return null;
  }
}

function persist(session: DiningSession | null): void {
  try {
    if (session) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private browsing / storage disabled — the session still works for this page load via
    // React state, it just won't survive a refresh (the diner would need to re-scan the QR).
  }
}

interface SessionContextValue {
  session: DiningSession | null;
  setSession: (session: DiningSession) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/**
 * Holds the dining-session bearer token and the table/outlet context returned by
 * `POST /qr/:token/resolve` (see lib/api/qr.ts). `sessionStorage`, not `localStorage`: per
 * docs/qr-ordering.md, each browser tab that scans the table QR gets its own `guestToken` —
 * tying the token to tab lifetime (not device lifetime) matches that model, and means closing
 * the tab is a clean way for a diner to "leave" without any account to sign out of.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<DiningSession | null>(loadInitialSession);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      setSession: (next) => {
        persist(next);
        setSessionState(next);
      },
      clearSession: () => {
        persist(null);
        setSessionState(null);
      },
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
