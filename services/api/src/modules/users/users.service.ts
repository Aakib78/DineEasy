import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotFoundDomainError, ValidationDomainError } from '../../common/errors/domain-errors';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(organizationId: string, dto: CreateStaffDto, actorUserId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ValidationDomainError(`A staff account with email ${dto.email} already exists`);
    }

    const role = await this.prisma.role.findFirst({
      where: { organizationId, name: dto.roleName },
    });
    if (!role) {
      throw new ValidationDomainError(`Unknown role "${dto.roleName}" for this organization`);
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId,
          name: dto.name,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          passwordHash,
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, roleId: role.id, outletId: dto.outletId ?? null },
      });
      return created;
    });

    await this.auditLog.record({
      organizationId,
      outletId: dto.outletId,
      actorUserId,
      action: 'staff.created',
      entityType: 'User',
      entityId: user.id,
      newState: { name: user.name, email: user.email, role: dto.roleName },
    });

    return this.getById(organizationId, user.id);
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.user
      .findMany({
        where: { organizationId },
        include: { roles: { include: { role: true, outlet: true } } },
        orderBy: { createdAt: 'asc' },
        // passwordHash is selected by default by Prisma; strip it before returning to clients.
      })
      .then((users) => users.map(stripPasswordHash));
  }

  async getById(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { organizationId, id },
      include: { roles: { include: { role: true, outlet: true } } },
    });
    if (!user) throw new NotFoundDomainError('User', id);
    return stripPasswordHash(user);
  }

  async update(organizationId: string, id: string, dto: UpdateStaffDto, actorUserId: string) {
    const before = await this.getById(organizationId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { organizationId, id },
        data: {
          name: dto.name,
          phone: dto.phone,
          status: dto.status,
        },
      });

      if (dto.roleName) {
        const role = await tx.role.findFirst({ where: { organizationId, name: dto.roleName } });
        if (!role)
          throw new ValidationDomainError(`Unknown role "${dto.roleName}" for this organization`);

        await tx.userRole.deleteMany({ where: { userId: id, outletId: dto.outletId ?? null } });
        await tx.userRole.create({
          data: { userId: id, roleId: role.id, outletId: dto.outletId ?? null },
        });
      }
    });

    const after = await this.getById(organizationId, id);

    await this.auditLog.record({
      organizationId,
      outletId: dto.outletId,
      actorUserId,
      action: 'staff.updated',
      entityType: 'User',
      entityId: id,
      previousState: before,
      newState: after,
    });

    return after;
  }

  /**
   * Removes exactly one `UserRole` row — the one matching `(userId, outletId)`, same targeting
   * as `update`'s own delete-and-recreate. Refuses to remove a staff member's *only* remaining
   * role assignment: with zero rows left, `AccessTokenPayload.permissions` would resolve to an
   * empty set (see `AuthService.resolveActiveOutlet`/token issuance) and the account would be
   * effectively locked out with no in-app way to recover short of another Owner reassigning
   * them, which is worse than just refusing the removal up front and telling the caller to
   * assign a replacement role first (or deactivate the account instead, via `status`, if the
   * real intent is "this person shouldn't have access at all").
   */
  async removeRoleAssignment(
    organizationId: string,
    userId: string,
    outletId: string | undefined,
    actorUserId: string,
  ) {
    const before = await this.getById(organizationId, userId);

    if (before.roles.length <= 1) {
      throw new ValidationDomainError(
        "Cannot remove a staff member's only role assignment — they would be left with no " +
          'access. Assign a replacement role first, or set their status to inactive instead.',
      );
    }

    const result = await this.prisma.userRole.deleteMany({
      where: { userId, outletId: outletId ?? null },
    });
    if (result.count === 0) {
      throw new NotFoundDomainError('Role assignment', `${userId}:${outletId ?? 'org-wide'}`);
    }

    const after = await this.getById(organizationId, userId);

    await this.auditLog.record({
      organizationId,
      outletId,
      actorUserId,
      action: 'staff.role_removed',
      entityType: 'User',
      entityId: userId,
      previousState: before,
      newState: after,
    });

    return after;
  }
}

function stripPasswordHash<T extends { passwordHash?: string }>(user: T): Omit<T, 'passwordHash'> {
  const rest: Partial<T> = { ...user };
  delete rest.passwordHash;
  return rest as Omit<T, 'passwordHash'>;
}
