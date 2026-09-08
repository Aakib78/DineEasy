import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { resolveQrToken } from '../lib/api/qr';
import { ApiError } from '../lib/api/client';
import { useSession } from '../lib/session/SessionContext';

/**
 * `/q/:token` — the URL encoded in the printed table QR (docs/qr-ordering.md). Exchanges the
 * opaque token for a dining-session bearer token and lands the diner on the menu. A guest who
 * re-scans (or reloads this exact URL again) simply resolves again — safe and idempotent up to
 * getting a fresh `guestToken` each time, which is the documented behavior, not a bug (see
 * QrService.resolveTokenAndJoinSession's doc comment on the backend).
 */
export function ResolveRoute() {
  const { token } = useParams<{ token: string }>();
  const { setSession } = useSession();
  const [status, setStatus] = useState<'loading' | 'error' | 'done'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('This link is missing its QR code — please rescan.');
      return;
    }

    let cancelled = false;
    resolveQrToken(token)
      .then((response) => {
        if (cancelled) return;
        setSession(response);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't connect to the restaurant's ordering system.",
        );
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // Deliberately only re-runs if the token itself changes (setSession's identity is stable
    // from SessionContext's useMemo, but omitting it entirely would trip the exhaustive-deps
    // lint — see eslint.config.js).
  }, [token, setSession]);

  if (status === 'done') return <Navigate to="/menu" replace />;

  if (status === 'error') {
    return (
      <div className="scan-prompt">
        <div className="scan-prompt__icon" aria-hidden="true">
          ⚠️
        </div>
        <h1>Couldn't open this table</h1>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="scan-prompt">
      <div className="spinner" aria-hidden="true" />
      <p>Opening your table…</p>
    </div>
  );
}
