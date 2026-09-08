import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError, ValidationDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { RealtimeGateway } from '../../common/realtime/realtime.gateway';
import { OrderStatus, isOrderFinanciallySettled } from '../../common/order/order-state-machine';

/**
 * A DiningSession represents one table's occupancy from first QR scan to staff closing the
 * table — see docs/architecture.md §6. Multiple guests scanning the same table QR join the
 * same OPEN session; it's the staff (not a client-side timeout) who explicitly close it,
 * typically right after billing, so a dropped phone connection never silently ends it.
 */
@Injectable()
export class DiningSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async findOrCreateOpenSession(organizationId: string, outletId: string, tableId: string) {
    const existing = await this.prisma.diningSession.findFirst({
      where: { organizationId, outletId, tableId, status: 'OPEN' },
    });
    if (existing) return existing;

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.diningSession.create({
        data: { organizationId, outletId, tableId, status: 'OPEN' },
      });
      await tx.restaurantTable.updateMany({
        where: { id: tableId, outletId },
        data: { status: 'OCCUPIED' },
      });
      return created;
    });

    this.realtime.tableUpdated(outletId, tableId);

    return session;
  }

  async getById(organizationId: string, id: string) {
    const session = await this.prisma.diningSession.findFirst({
      where: { organizationId, id },
      include: { table: true, orders: { include: { items: true } } },
    });
    if (!session) throw new NotFoundDomainError('DiningSession', id);
    return session;
  }

  async listOpenForOutlet(organizationId: string, outletId: string) {
    return this.prisma.diningSession.findMany({
      where: { organizationId, outletId, status: 'OPEN' },
      include: { table: true, orders: true },
      orderBy: { startedAt: 'asc' },
    });
  }

  /**
   * Staff-initiated close (spec §11 "close table"), typically once the bill is fully paid.
   * Refuses to close while any order in the session is still active (not yet financially
   * settled — see ORDER_FINANCIALLY_SETTLED_STATUSES in order-state-machine.ts, notably still
   * blocked at BILLED: a bill having been generated doesn't mean it's been paid) — an order
   * domain rule enforced here rather than left to the client to remember, per spec §31/§50.
   */
  async close(organizationId: string, outletId: string, id: string, actorUserId: string) {
    const session = await this.getById(organizationId, id);

    const unsettledOrder = session.orders.find(
      (o) => !isOrderFinanciallySettled(o.status as OrderStatus),
    );
    if (unsettledOrder) {
      throw new ValidationDomainError(
        `Cannot close this table while order ${unsettledOrder.orderNumber} is still ${unsettledOrder.status}`,
      );
    }

    // DiningSession is org-scoped, so a bare `update()` is refused by PrismaService's tenant
    // guard (SINGLE_RECORD_ACTIONS — only findFirst/updateMany/deleteMany accept an explicit
    // scope filter). `updateMany` + a follow-up read is the tenant-safe equivalent.
    await this.prisma.$transaction(async (tx) => {
      await tx.diningSession.updateMany({
        where: { id, organizationId },
        data: { status: 'CLOSED', endedAt: new Date() },
      });
      await tx.restaurantTable.updateMany({
        where: { id: session.tableId, outletId },
        data: { status: 'AVAILABLE' },
      });
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'dining_session.closed',
      entityType: 'DiningSession',
      entityId: id,
    });

    this.realtime.tableUpdated(outletId, session.tableId);

    return this.prisma.diningSession.findFirst({ where: { organizationId, id } });
  }
}
