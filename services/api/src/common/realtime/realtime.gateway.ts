import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { AccessTokenPayload } from '../../modules/auth/types/authenticated-user.type';
import { GuestSessionPayload } from '../guest-auth/guest-session.type';

/**
 * Real-time "refetch hint" channel (spec §8/§34): every event this gateway emits is a small
 * `{type, ids}` nudge telling a client "something changed, go refetch" — NEVER the
 * authoritative payload itself. A client that missed an event entirely (offline, mid-
 * reconnect, or never connected in the first place) is always fully correct after its next
 * REST call; nothing here is load-bearing for correctness. See docs/architecture.md §8 and
 * docs/offline-mode.md — this is exactly the property that makes LAN Wi-Fi hiccups safe.
 *
 * v1 runs a single Socket.IO instance in-process, matching the LAN-first single-server
 * deployment model (docs/architecture.md §1: one restaurant server, no horizontal scaling in
 * v1) — there is deliberately no Redis adapter for cross-replica fan-out here; it would be
 * needed the moment a second API instance exists, and not before.
 *
 * Rooms:
 *  - `outlet:<outletId>` — every staff connection from that outlet (POS/Waiter/KDS all
 *    listen here; they're allowed to see everything happening at their own outlet).
 *  - `session:<diningSessionId>` — a guest's own dining session only. A guest is
 *    deliberately never added to the outlet-wide room — they have no business seeing that
 *    table 4 across the room just placed an order, even as a contentless hint.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly config: ConfigService) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) return this.reject(client, 'missing auth token');

    const staff = this.tryVerifyStaff(token);
    if (staff) {
      if (!staff.activeOutletId) return this.reject(client, 'staff token has no active outlet');
      void client.join(`outlet:${staff.activeOutletId}`);
      return;
    }

    const guest = this.tryVerifyGuest(token);
    if (guest) {
      void client.join(`session:${guest.diningSessionId}`);
      return;
    }

    this.reject(client, 'token did not verify as staff or guest');
  }

  handleDisconnect(): void {
    // No-op: Socket.IO removes a disconnected client from every room automatically.
  }

  // ---------------------------------------------------------------------
  // Emit helpers — called by domain services after a state change commits.
  // Always fire-and-forget; a Socket.IO emit never throws into the caller.
  // ---------------------------------------------------------------------

  orderUpdated(outletId: string, orderId: string, diningSessionId?: string | null): void {
    this.server.to(`outlet:${outletId}`).emit('order.updated', { orderId });
    if (diningSessionId)
      this.server.to(`session:${diningSessionId}`).emit('order.updated', { orderId });
  }

  kitchenQueueUpdated(outletId: string): void {
    this.server.to(`outlet:${outletId}`).emit('kitchen.queue_updated', {});
  }

  tableUpdated(outletId: string, tableId: string): void {
    this.server.to(`outlet:${outletId}`).emit('table.updated', { tableId });
  }

  // ---------------------------------------------------------------------

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    const header = client.handshake.headers.authorization;
    const fromHeader = typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : undefined;
    return fromAuth ?? fromHeader;
  }

  private tryVerifyStaff(token: string): AccessTokenPayload | undefined {
    try {
      return jwt.verify(
        token,
        this.config.get<string>('auth.accessSecret')!,
      ) as unknown as AccessTokenPayload;
    } catch {
      return undefined;
    }
  }

  private tryVerifyGuest(token: string): GuestSessionPayload | undefined {
    try {
      return jwt.verify(
        token,
        this.config.get<string>('qr.tokenSecret')!,
      ) as unknown as GuestSessionPayload;
    } catch {
      return undefined;
    }
  }

  private reject(client: Socket, reason: string): void {
    this.logger.debug(`Rejecting WebSocket connection: ${reason}`);
    client.disconnect(true);
  }
}
