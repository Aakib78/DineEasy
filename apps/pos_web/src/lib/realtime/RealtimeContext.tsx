import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiBaseUrl } from '../api/client';
import { tokenStorage } from '../auth/token-storage';
import { useAuth } from '../auth/AuthContext';

/**
 * Connects once per signed-in session to `RealtimeGateway`
 * (`services/api/src/common/realtime/realtime.gateway.ts`), joining `outlet:<activeOutletId>`
 * server-side from the staff access token — mirrors
 * `apps/restaurant_app/lib/core/realtime/realtime_service.dart` (Flutter) and
 * `apps/customer_web/src/lib/realtime/useOrderUpdates.ts` (guest web), extended here to a
 * shared context since this app has several screens that each care about different event
 * types (tables, orders, kitchen queue, notifications) off the same one socket, rather than
 * one screen caring about exactly one event the way the guest tracking screen does.
 *
 * Every event is a content-free "something changed, go refetch" hint, never authoritative data
 * — see the gateway's own class doc comment. A screen that never sees an event (offline,
 * missed the emit) is still correct after its next manual/poll refresh; this only closes the
 * gap for how live it feels, never a correctness requirement.
 */
const RealtimeContext = createContext<Socket | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      return;
    }

    const stored = tokenStorage.read();
    if (!stored) return;

    // The gateway is mounted on the same NestJS server as the REST API, at the default
    // Socket.IO path — strip the "/api/v1" REST prefix to get the bare origin it listens on.
    const wsOrigin = apiBaseUrl().replace(/\/api\/v1\/?$/, '');

    let created: Socket | undefined;
    try {
      created = io(wsOrigin, {
        auth: { token: stored.accessToken },
        transports: ['websocket'],
        reconnectionAttempts: Infinity,
      });
    } catch {
      // Socket.IO client construction shouldn't normally throw, but if it does, fail silently
      // into "no realtime, refresh-on-navigation only" rather than crashing the whole app over
      // a nice-to-have.
      return;
    }
    setSocket(created);

    return () => {
      created?.disconnect();
    };
    // Re-connects only when the signed-in user changes (login/logout) — a token *refresh*
    // (same user, new access token) deliberately does NOT reconnect: the gateway only checks
    // the token once, at handshake, and an already-open connection keeps working off its
    // original room membership regardless (outlet/permissions don't change mid-shift in v1 —
    // see AuthUser's doc comment on the "effective permissions at token-issue time" tradeoff).
  }, [user]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

/** Subscribes `handler` to `event` on the shared realtime socket for as long as the calling
 * component is mounted. Safe to call even before the socket connects (or if it never does) —
 * `.on` on a not-yet-connected Socket.IO client instance just queues the listener, and `socket`
 * being `null` here (no session yet, or connection failed) just means the effect no-ops. */
export function useRealtimeEvent(event: string, handler: () => void): void {
  const socket = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket) return;
    const listener = () => handlerRef.current();
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
