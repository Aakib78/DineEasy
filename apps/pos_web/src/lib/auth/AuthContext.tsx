import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PermissionKey } from '@dineeasy/shared-types';
import { tokenStorage } from './token-storage';
import { decodeJwtPayload, isJwtExpired } from './jwt';
import { setAuthFailureHandler, ApiError } from '../api/client';
import { login as loginRequest, logout as logoutRequest } from '../api/auth';

/** Mirrors `AccessTokenPayload` (`services/api/src/modules/auth/types/authenticated-user.type.ts`)
 * and `apps/restaurant_app/lib/core/auth/access_token_claims.dart`'s `AccessTokenClaims`.
 * `permissions` is the user's *effective* permission set at token-issue time — a permission
 * change takes effect on that user's next token refresh, not instantly (docs/authentication.md). */
export interface AuthUser {
  userId: string;
  organizationId: string;
  /** Null means this staff member has no outlet assigned yet — most routes need one; the UI
   * should show a clear "ask your manager to assign you to an outlet" state (see App.tsx). */
  activeOutletId: string | null;
  permissions: Set<PermissionKey | string>;
  name: string;
  email: string;
}

function claimsFromToken(accessToken: string): AuthUser {
  const payload = decodeJwtPayload(accessToken);
  return {
    userId: payload.sub as string,
    organizationId: payload.organizationId as string,
    activeOutletId: (payload.activeOutletId as string | undefined) ?? null,
    permissions: new Set((payload.permissions as string[] | undefined) ?? []),
    name: payload.name as string,
    email: payload.email as string,
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True only while restoring a stored session on first load — never true again after. */
  restoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: PermissionKey | string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    // Registered once — see client.ts's doc comment on why this indirection exists instead of
    // a direct import. Cleared on unmount mostly for hygiene (this provider lives for the
    // whole app lifetime in practice, see main.tsx).
    setAuthFailureHandler(() => setUser(null));
    return () => setAuthFailureHandler(undefined);
  }, []);

  useEffect(() => {
    const stored = tokenStorage.read();
    if (!stored) {
      setRestoring(false);
      return;
    }
    if (!isJwtExpired(stored.accessToken)) {
      try {
        setUser(claimsFromToken(stored.accessToken));
      } catch {
        tokenStorage.clear();
      }
      setRestoring(false);
      return;
    }
    // Stored access token looks expired — proactively refresh so the app doesn't start already
    // one request away from a 401 (mirrors AuthRepository.restoreSession on the Flutter side).
    // apiRequest's own refresh machinery handles this the moment any authenticated call goes
    // out, but doing it explicitly here means the table grid's first render already has a
    // valid `user` (and therefore correct permission-gated buttons) instead of a flash of
    // "no permissions yet" before the first successful request lands.
    void (async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1'}/auth/refresh`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          },
        );
        if (!response.ok) throw new Error('refresh failed');
        const data = (await response.json()) as { accessToken: string; refreshToken: string };
        tokenStorage.write(data);
        setUser(claimsFromToken(data.accessToken));
      } catch {
        tokenStorage.clear();
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const accessToken = await loginRequest(email, password);
    setUser(claimsFromToken(accessToken));
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: PermissionKey | string) => user?.permissions.has(permission) ?? false,
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, restoring, login, logout, hasPermission }),
    [user, restoring, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Re-exported so callers that only need to distinguish "session expired" from other failures
 * (e.g. a login form's own error branch) don't need a separate import for it. */
export { ApiError };
