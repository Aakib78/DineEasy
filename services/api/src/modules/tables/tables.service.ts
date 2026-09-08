import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateFloorDto } from './dto/create-floor.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // ---------------------------------------------------------------------
  // Floors
  // ---------------------------------------------------------------------

  async createFloor(organizationId: string, outletId: string, dto: CreateFloorDto, actorUserId: string) {
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
    diningSessions: { where: { status: 'OPEN' as const }, take: 1, orderBy: { startedAt: 'desc' as const } },
  };

  async createTable(organizationId: string, outletId: string, dto: CreateTableDto, actorUserId: string) {
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

  async updateTable(organizationId: string, outletId: string, id: string, dto: UpdateTableDto, actorUserId: string) {
    const before = await this.getTableById(outletId, id);

    await this.prisma.restaurantTable.updateMany({ where: { outletId, id }, data: dto });

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
  async regenerateQrCode(organizationId: string, outletId: string, tableId: string, actorUserId: string) {
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
