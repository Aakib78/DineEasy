import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError } from '../../common/errors/domain-errors';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuditLogService } from '../audit/audit-log.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async getById(organizationId: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: organizationId } });
    if (!org) throw new NotFoundDomainError('Organization', organizationId);
    return org;
  }

  async update(organizationId: string, dto: UpdateOrganizationDto, actorUserId: string) {
    const before = await this.getById(organizationId);

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: dto,
    });

    await this.auditLog.record({
      organizationId,
      actorUserId,
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: organizationId,
      previousState: before,
      newState: updated,
    });

    return updated;
  }
}
