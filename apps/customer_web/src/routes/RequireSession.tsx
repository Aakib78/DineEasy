import type { ReactNode } from 'react';
import { useSession } from '../lib/session/SessionContext';
import { ScanPrompt } from '../features/entry/ScanPrompt';

/** Gate for every route under `/menu`, `/cart`, `/orders/*` — none of them make sense without
 *  a resolved dining session. Mirrors the server's own DiningSessionGuard in spirit (client-
 *  side UX only; the real enforcement is that guard, on every request). */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useSession();

  if (!session) {
    return <ScanPrompt message="Your session has ended — please scan your table's QR code again to continue." />;
  }

  return <>{children}</>;
}
