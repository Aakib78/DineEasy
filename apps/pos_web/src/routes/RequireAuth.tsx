import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth/AuthContext';

/** Gate for every route except /login. While a stored session is being restored (page
 * load/reload with tokens already in localStorage — see AuthContext) this renders nothing
 * rather than bouncing straight to /login and back, which would flash the login screen on
 * every reload of an already-signed-in terminal. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, restoring } = useAuth();
  const location = useLocation();

  if (restoring) return null;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!user.activeOutletId) {
    return (
      <div className="empty-state">
        <p>Your account isn't assigned to an outlet yet.</p>
        <p className="empty-state__hint">Ask a manager to assign you to an outlet, then sign in again.</p>
      </div>
    );
  }

  return <>{children}</>;
}
