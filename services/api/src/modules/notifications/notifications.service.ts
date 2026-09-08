import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { RealtimeGateway } from '../../common/realtime/realtime.gateway';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { buildNotificationVisibilityWhere } from './notification-visibility.util';

/**
 * Mirrors the `NotificationType` enum in prisma/schema.prisma. A local literal union rather
 * than importing from `@prisma/client` — same reasoning as `OrderStatus` in
 * `common/order/order-state-machine.ts`: zero dependency on the generated client for anything
 * that only needs the *shape* of the type, tests included.
 */
export type NotificationType = 'ORDER_READY';

export interface CreateNotificationInput {
  organizationId: string;
  outletId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Omitted = outlet-wide broadcast, gated by `requiredPermission` below. */
  recipientUserId?: string;
  /** Only consulted when `recipientUserId` is omitted — see the Prisma model's doc comment. */
  requiredPermission?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * A persisted, queryable notification inbox — distinct from `RealtimeGateway`'s ephemeral
 * `{type, ids}` WebSocket hints, which are never stored (see that class's doc comment). This
 * is the source of truth; `RealtimeGateway.notificationCreated` is just what tells an already-
 * connected client to come refetch `listForUser` sooner rather than waiting for its next poll.
 *
 * v1 has exactly one creator: `OrdersService.transitionStatus` calls `notifyOrderReady` when
 * an order becomes READY (see that method's doc comment for why it's the single choke point
 * every order status change already passes through). More trigger points are a straightforward
 * addition later — nothing here is ORDER_READY-specific — but only what's actually wired is
 * built, not speculative coverage of every notification the original spec might have wanted.
 *
 * Read-state simplification worth knowing: `readAt` lives on the notification row itself, not
 * a per-(notification, recipient) join table. For a *targeted* notification (`recipientUserId`
 * set) that's exactly right — only that one person can see it anyway. For a *broadcast*
 * notification (`recipientUserId` null, e.g. "table 5 is ready"), it means marking it read is
 * shared: the first staff member who dismisses it dismisses it for the whole outlet. That's a
 * deliberate v1 choice, not an oversight — for the kind of broadcast this system creates today
 * ("this needs doing"), once anyone's acted on it, it *should* stop pinging everyone else, not
 * just the one person who saw it first. A true per-user read receipt would need a join table;
 * that's a reasonable future addition if a notification type is ever added where individually-
 * tracked read state actually matters.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Never throws into the caller — a failed notification write must not block the business
   * operation that triggered it (which has usually already committed by the time this runs),
   * same contract as `AuditLogService.record`. Logged loudly instead so it's not silently lost.
   */
  async create(input: CreateNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          organizationId: input.organizationId,
          outletId: input.outletId,
          type: input.type,
          title: input.title,
          body: input.body,
          recipientUserId: input.recipientUserId,
          requiredPermission: input.requiredPermission,
          entityType: input.entityType,
          entityId: input.entityId,
        },
      });
      this.realtime.notificationCreated(input.outletId);
    } catch (err) {
      this.logger.error(
        `Failed to create ${input.type} notification for outlet ${input.outletId}: ${(err as Error).message}`,
      );
    }
  }

  /** Convenience wrapper for the one trigger this module has today — see class doc comment. */
  async notifyOrderReady(
    organizationId: string,
    outletId: string,
    orderId: string,
    orderLabel: string,
  ): Promise<void> {
    await this.create({
      organizationId,
      outletId,
      type: 'ORDER_READY',
      title: 'Order ready to serve',
      body: `${orderLabel} is ready — every item has been plated.`,
      requiredPermission: PERMISSIONS.ORDERS_VIEW,
      entityType: 'Order',
      entityId: orderId,
    });
  }

  /**
   * Every notification visible to `user`: addressed to them by name, or an outlet-wide
   * broadcast they hold the required permission for (no `requiredPermission` at all means
   * every staff member at the outlet, regardless of role).
   */
  async listForUser(
    organizationId: string,
    outletId: string,
    user: AuthenticatedUser,
    options?: { unreadOnly?: boolean; limit?: number },
  ) {
    return this.prisma.notification.findMany({
      where: {
        ...buildNotificationVisibilityWhere(organizationId, outletId, user),
        ...(options?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(options?.limit ?? 50, 200),
    });
  }

  async unreadCount(organizationId: string, outletId: string, user: AuthenticatedUser) {
    return this.prisma.notification.count({
      where: { ...buildNotificationVisibilityWhere(organizationId, outletId, user), readAt: null },
    });
  }

  /** Only ever marks a notification `user` can actually see — see `listForUser`'s visibility rule. */
  async markRead(
    organizationId: string,
    outletId: string,
    notificationId: string,
    user: AuthenticatedUser,
  ) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        ...buildNotificationVisibilityWhere(organizationId, outletId, user),
      },
    });
    if (!notification) throw new NotFoundDomainError('Notification', notificationId);

    if (!notification.readAt) {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, organizationId, outletId },
        data: { readAt: new Date() },
      });
    }

    return this.prisma.notification.findFirst({ where: { id: notificationId } });
  }

  /** Marks every notification currently visible to `user` as read in one pass. */
  async markAllRead(organizationId: string, outletId: string, user: AuthenticatedUser) {
    const visible = await this.listForUser(organizationId, outletId, user, {
      unreadOnly: true,
      limit: 200,
    });
    if (visible.length === 0) return { updated: 0 };

    const result = await this.prisma.notification.updateMany({
      where: { id: { in: visible.map((n) => n.id) } },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
