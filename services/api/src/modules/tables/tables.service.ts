import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { DiningSessionsService } from '../dining-sessions/dining-sessions.service';
import { CreateFloorDto } from './dto/create-floor.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly diningSessions: DiningSessionsService,
  ) {}

  // ---------------------------------------------------------------------
  // Floors
  // ---------------------------------------------------------------------

  async createFloor(
    organizationId: string,
    outletId: string,
    dto: CreateFloorDto,
    actorUserId: string,
  ) {
    const floor = await this.prisma.floor.create({
      data: { outletId, name: dto.name, displayOrder: dto.displayOrder ?? 0 },
    });
    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'floor.created',
      entityType: 'Floor',
      entityId: floor.id,
      newState: floor,
    });
    return floor;
  }

  async listFloors(outletId: string) {
    return this.prisma.floor.findMany({ where: { outletId }, orderBy: { displayOrder: 'asc' } });
  }

  // ---------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------

  /** Includes the current open dining session (if any) so the POS floor view can render occupancy at a glance. */
  private readonly TABLE_INCLUDE = {
    qrCode: true,
    diningSessions: {
      where: { status: 'OPEN' as const },
      take: 1,
      orderBy: { startedAt: 'desc' as const },
    },
  };

  async createTable(
    organizationId: string,
    outletId: string,
    dto: CreateTableDto,
    actorUserId: string,
  ) {
    const floor = await this.prisma.floor.findFirst({ where: { outletId, id: dto.floorId } });
    if (!floor) throw new NotFoundDomainError('Floor', dto.floorId);

    const table = await this.prisma.$transaction(async (tx) => {
      const created = await tx.restaurantTable.create({
        data: {
          outletId,
          floorId: dto.floorId,
          name: dto.name,
          capacity: dto.capacity ?? 2,
          displayOrder: dto.displayOrder ?? 0,
        },
      });
      await tx.tableQrCode.create({ data: { tableId: created.id, token: generateQrToken() } });
      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'table.created',
      entityType: 'RestaurantTable',
      entityId: table.id,
      newState: table,
    });

    return this.getTableById(outletId, table.id);
  }

  async listTables(outletId: string) {
    return this.prisma.restaurantTable.findMany({
      where: { outletId },
      include: this.TABLE_INCLUDE,
      orderBy: [{ floorId: 'asc' }, { displayOrder: 'asc' }],
    });
  }

  async getTableById(outletId: string, id: string) {
    const table = await this.prisma.restaurantTable.findFirst({
      where: { outletId, id },
      include: this.TABLE_INCLUDE,
    });
    if (!table) throw new NotFoundDomainError('RestaurantTable', id);
    return table;
  }

  /**
   * Setting `status: 'AVAILABLE'` used to just flip the column directly via the `updateMany`
   * below — bypassing `DiningSessionsService.close()` entirely. That meant no
   * financially-settled check (a table could be freed while an order was still unpaid), no
   * `DiningSession.endedAt`, no `dining_session.closed` audit entry, and a guest rescanning that
   * table's QR would silently rejoin the still-`OPEN` session
   * (`findOrCreateOpenSession` matches on `status: 'OPEN'`) instead of starting a fresh one. This
   * generic table-edit endpoint was, in practice, the only "close table" affordance either app
   * exposed — routed through the real close workflow instead of a bare status write whenever
   * there's actually an open session to close; `close()` throws (and this call fails with it,
   * before any other field on `dto` is applied) if an order in that session isn't settled yet.
   */
  async updateTable(
    organizationId: string,
    outletId: string,
    id: string,
    dto: UpdateTableDto,
    actorUserId: string,
  ) {
    const before = await this.getTableById(outletId, id);

    const openSession = before.diningSessions[0];
    const closingViaAvailable = dto.status === 'AVAILABLE' && Boolean(openSession);

    if (closingViaAvailable) {
      await this.diningSessions.close(organizationId, outletId, openSession.id, actorUserId);
    }

    // `close()` above already set the table to AVAILABLE — status is left out of this write in
    // that case (Prisma treats an `undefined` field as "don't touch", same convention already
    // used by every optional-field DTO in this codebase) so it isn't redundantly re-applied.
    // Guarded against an empty `data` object (e.g. a PATCH that was *only* `{status:
    // 'AVAILABLE'}` on a table that had a session to close) — Prisma's `updateMany` isn't meant
    // to be called with nothing to set.
    const remainingUpdate = closingViaAvailable ? { ...dto, status: undefined } : dto;
    const hasRemainingFields = Object.values(remainingUpdate).some((v) => v !== undefined);
    if (hasRemainingFields) {
      await this.prisma.restaurantTable.updateMany({
        where: { outletId, id },
        data: remainingUpdate,
      });
    }

    const after = await this.getTableById(outletId, id);

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'table.updated',
      entityType: 'RestaurantTable',
      entityId: id,
      previousState: before,
      newState: after,
    });

    return after;
  }

  /**
   * Invalidates the current QR token and issues a new one (spec §5: "QR tokens must be
   * revocable and regeneratable"). A table has exactly one TableQrCode row (schema:
   * `tableId` is @unique) — DiningSession doesn't record which token was scanned to create
   * it, only which table, so rotating the token in place (rather than keeping old rows
   * around) is safe: any dining session already open on this table stays open regardless.
   * See docs/qr-ordering.md.
   */
  async regenerateQrCode(
    organizationId: string,
    outletId: string,
    tableId: string,
    actorUserId: string,
  ) {
    await this.getTableById(outletId, tableId); // ownership check

    const newQrCode = await this.prisma.tableQrCode.update({
      where: { tableId },
      data: { token: generateQrToken(), isActive: true, regeneratedAt: new Date() },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'table.qr_regenerated',
      entityType: 'RestaurantTable',
      entityId: tableId,
    });

    return newQrCode;
  }
}

/** High-entropy, URL-safe, opaque — see docs/qr-ordering.md for why this isn't a signed JWT. */
function generateQrToken(): string {
  return nanoid(32);
}
