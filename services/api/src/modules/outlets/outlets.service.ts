import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';

@Injectable()
export class OutletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(organizationId: string, dto: CreateOutletDto, actorUserId: string) {
    const outlet = await this.prisma.outlet.create({
      data: { organizationId, ...dto, code: dto.code.toUpperCase() },
    });

    await this.auditLog.record({
      organizationId,
      outletId: outlet.id,
      actorUserId,
      action: 'outlet.created',
      entityType: 'Outlet',
      entityId: outlet.id,
      newState: outlet,
    });

    return outlet;
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.outlet.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getById(organizationId: string, id: string) {
    const outlet = await this.prisma.outlet.findFirst({ where: { organizationId, id } });
    if (!outlet) throw new NotFoundDomainError('Outlet', id);
    return outlet;
  }

  async update(organizationId: string, id: string, dto: UpdateOutletDto, actorUserId: string) {
    const before = await this.getById(organizationId, id);

    // Outlet is org-scoped, so a bare `update()` (which only accepts a @unique/@id `where`)
    // is refused by PrismaService's tenant guard — see prisma.service.ts's
    // SINGLE_RECORD_ACTIONS comment. `updateMany` with an explicit organizationId filter is
    // the tenant-safe equivalent for single-record writes on scoped models.
    await this.prisma.outlet.updateMany({ where: { id, organizationId }, data: dto });
    const updated = await this.getById(organizationId, id);

    await this.auditLog.record({
      organizationId,
      outletId: id,
      actorUserId,
      action: 'outlet.updated',
      entityType: 'Outlet',
      entityId: id,
      previousState: before,
      newState: updated,
    });

    return updated;
  }
}
