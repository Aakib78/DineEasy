import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateTaxGroupDto } from './dto/create-tax-group.dto';

/**
 * Tax groups (e.g. "GST 5%" = CGST 2.5% + SGST 2.5%) are outlet-scoped and referenced by
 * `MenuItem.taxGroupId`. See docs/database.md "Why TaxGroup + TaxGroupComponent" for why
 * this isn't just a flat percentage on the item.
 */
@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(organizationId: string, outletId: string, dto: CreateTaxGroupDto, actorUserId: string) {
    const taxGroup = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taxGroup.create({ data: { outletId, name: dto.name } });
      await tx.taxGroupComponent.createMany({
        data: dto.components.map((c) => ({
          taxGroupId: created.id,
          taxType: c.taxType,
          ratePercent: c.ratePercent,
        })),
      });
      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'tax_group.created',
      entityType: 'TaxGroup',
      entityId: taxGroup.id,
      newState: dto,
    });

    return this.getById(outletId, taxGroup.id);
  }

  async listForOutlet(outletId: string) {
    return this.prisma.taxGroup.findMany({
      where: { outletId, isActive: true },
      include: { components: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(outletId: string, id: string) {
    const taxGroup = await this.prisma.taxGroup.findFirst({
      where: { outletId, id },
      include: { components: true },
    });
    if (!taxGroup) throw new NotFoundDomainError('TaxGroup', id);
    return taxGroup;
  }
}
