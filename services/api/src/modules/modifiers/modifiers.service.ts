import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateModifierGroupDto } from './dto/create-modifier-group.dto';
import { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';
import { CreateModifierDto } from './dto/create-modifier.dto';
import { UpdateModifierDto } from './dto/update-modifier.dto';

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

  async listForOutlet(outletId: string, includeInactive = false) {
    return this.prisma.modifierGroup.findMany({
      where: { outletId, ...(includeInactive ? {} : { isActive: true }) },
      // Modifiers within a group are still filtered to active-only regardless — an admin
      // reactivating a deactivated group via `includeInactive` reactivates the group, not every
      // modifier inside it; those are edited individually (see `updateModifier`).
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

  /**
   * Was the biggest gap in this module: `CreateModifierGroupDto.modifiers` only accepted a full
   * array up front, and `UpdateModifierGroupDto` never touched it — there was no way to add a
   * modifier to a group after creation (e.g. a new "Extra Cheese" option on an existing
   * "Toppings" group) short of recreating the whole group. `displayOrder` continues after the
   * group's current highest so a newly-added modifier lands at the end of the list by default.
   */
  async addModifier(
    organizationId: string,
    outletId: string,
    modifierGroupId: string,
    dto: CreateModifierDto,
    actorUserId: string,
  ) {
    await this.getById(outletId, modifierGroupId); // ownership check

    const highest = await this.prisma.modifier.aggregate({
      where: { modifierGroupId },
      _max: { displayOrder: true },
    });

    const modifier = await this.prisma.modifier.create({
      data: {
        modifierGroupId,
        name: dto.name,
        priceDelta: dto.priceDelta ?? 0,
        displayOrder: (highest._max.displayOrder ?? -1) + 1,
      },
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'modifier.created',
      entityType: 'Modifier',
      entityId: modifier.id,
      newState: modifier,
    });

    return modifier;
  }

  /** Same gap as `addModifier` but for editing/deactivating one that already exists — a
   * mispriced modifier (wrong `priceDelta`) or a discontinued one had no fix short of a direct
   * database edit until now. `Modifier.isActive` was a schema column no endpoint ever set. */
  async updateModifier(
    organizationId: string,
    outletId: string,
    modifierGroupId: string,
    modifierId: string,
    dto: UpdateModifierDto,
    actorUserId: string,
  ) {
    await this.getById(outletId, modifierGroupId); // ownership check

    const before = await this.prisma.modifier.findFirst({
      where: { id: modifierId, modifierGroupId },
    });
    if (!before) throw new NotFoundDomainError('Modifier', modifierId);

    const modifier = await this.prisma.modifier.update({
      where: { id: modifierId },
      data: dto,
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'modifier.updated',
      entityType: 'Modifier',
      entityId: modifierId,
      previousState: before,
      newState: modifier,
    });

    return modifier;
  }
}
