import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateModifierGroupDto } from './dto/create-modifier-group.dto';
import { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';

/**
 * Modifier groups are outlet-scoped and reusable across menu items (e.g. "Spice Level" used
 * by a dozen dishes) — see docs/database.md "Why a reusable ModifierGroup".
 */
@Injectable()
export class ModifiersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(
    organizationId: string,
    outletId: string,
    dto: CreateModifierGroupDto,
    actorUserId: string,
  ) {
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.modifierGroup.create({
        data: {
          outletId,
          name: dto.name,
          minSelect: dto.minSelect ?? 0,
          maxSelect: dto.maxSelect ?? 1,
          isRequired: dto.isRequired ?? false,
        },
      });
      await tx.modifier.createMany({
        data: dto.modifiers.map((m, i) => ({
          modifierGroupId: created.id,
          name: m.name,
          priceDelta: m.priceDelta ?? 0,
          displayOrder: i,
        })),
      });
      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'modifier_group.created',
      entityType: 'ModifierGroup',
      entityId: group.id,
      newState: dto,
    });

    return this.getById(outletId, group.id);
  }

  async listForOutlet(outletId: string) {
    return this.prisma.modifierGroup.findMany({
      where: { outletId, isActive: true },
      include: { modifiers: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getById(outletId: string, id: string) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { outletId, id },
      include: { modifiers: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!group) throw new NotFoundDomainError('ModifierGroup', id);
    return group;
  }

  async update(
    organizationId: string,
    outletId: string,
    id: string,
    dto: UpdateModifierGroupDto,
    actorUserId: string,
  ) {
    const before = await this.getById(outletId, id);

    await this.prisma.modifierGroup.updateMany({ where: { outletId, id }, data: dto });

    const after = await this.getById(outletId, id);

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'modifier_group.updated',
      entityType: 'ModifierGroup',
      entityId: id,
      previousState: before,
      newState: after,
    });

    return after;
  }
}
