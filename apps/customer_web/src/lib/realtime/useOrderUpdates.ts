import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiBaseUrl } from '../api/client';

/**
 * Subscribes to `RealtimeGateway`'s `order.updated` refetch hint for this dining session
 * (`session:<diningSessionId>` room — see services/api/src/common/realtime/realtime.gateway.ts).
 * This closes the loop docs/qr-ordering.md flagged as "not yet built" when that doc was
 * written — see docs/customer-web.md for the update.
 *
 * Deliberately a *hint*, never authoritative data: `onUpdate` should just trigger a refetch of
 * the order via `fetchOrder`, exactly like the staff apps do. If the socket never connects (a
 * captive portal, a proxy that blocks WebSocket upgrades, whatever) the caller's own polling
 * fallback is what keeps the tracking screen correct — see OrderStatusScreen.
 */
export function useOrderUpdates(sessionToken: string | undefined, onUpdate: () => void): void {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!sessionToken) return;

    // The gateway is mounted on the same NestJS server as the REST API, at the default
    // Socket.IO path — strip the "/api/v1" REST prefix to get the bare origin it listens on.
    const wsOrigin = apiBaseUrl().replace(/\/api\/v1\/?$/, '');

    let socket: Socket | undefined;
    try {
      socket = io(wsOrigin, {
        auth: { token: sessionToken },
        transports: ['websocket'],
        reconnectionAttempts: Infinity,
      });
    } catch {
      // Socket.IO client construction shouldn't normally throw, but if it does (e.g. a
      // malformed origin), fail silently into "no realtime, polling only" rather than crashing
      // the order-tracking screen over a nice-to-have.
      return;
    }

    socket.on('order.updated', () => onUpdateRef.current());

    return () => {
      socket?.disconnect();
    };
  }, [sessionToken]);
}
