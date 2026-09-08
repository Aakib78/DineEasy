import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError, ValidationDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';

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
  ) {}

  async findOrCreateOpenSession(organizationId: string, outletId: string, tableId: string) {
    const existing = await this.prisma.diningSession.findFirst({
      where: { organizationId, outletId, tableId, status: 'OPEN' },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.diningSession.create({
        data: { organizationId, outletId, tableId, status: 'OPEN' },
      });
      await tx.restaurantTable.updateMany({
        where: { id: tableId, outletId },
        data: { status: 'OCCUPIED' },
      });
      return session;
    });
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
   * Refuses to close while any order in the session is still active (not yet PAID/COMPLETED/
   * CANCELLED/REFUNDED) — an order domain rule enforced here rather than left to the client
   * to remember, per spec §31/§50.
   */
  async close(organizationId: string, outletId: string, id: string, actorUserId: string) {
    const session = await this.getById(organizationId, id);

    const unsettledOrder = session.orders.find(
      (o) => !['PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(o.status),
    );
    if (unsettledOrder) {
      throw new ValidationDomainError(
        `Cannot close this table while order ${unsettledOrder.orderNumber} is still ${unsettledOrder.status}`,
      );
    }

    const closed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.diningSession.update({
        where: { id },
        data: { status: 'CLOSED', endedAt: new Date() },
      });
      await tx.restaurantTable.updateMany({
        where: { id: session.tableId, outletId },
        data: { status: 'AVAILABLE' },
      });
      return updated;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'dining_session.closed',
      entityType: 'DiningSession',
      entityId: id,
    });

    return closed;
  }
}
