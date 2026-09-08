import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextStore } from '../../common/context/tenant-context';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from '../../common/rbac/permissions.catalog';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures the global permission catalog exists (idempotent — safe to call on every boot,
   * not just once). The catalog itself isn't tenant-scoped (see schema.prisma `Permission`).
   *
   * Accepts an optional transaction client so callers that need this inside a larger
   * transaction (e.g. AuthService.register — see its comment on why) stay on one connection
   * instead of racing an uncommitted row on a separate one.
   */
  async ensurePermissionCatalog(db: Db = this.prisma): Promise<void> {
    await TenantContextStore.runUnscoped(async () => {
      // Global lookup table shared by every tenant — never returns tenant data, just seeds
      // fixed permission-key rows, so bypassing the per-tenant guard here is safe.
      for (const permission of ALL_PERMISSIONS) {
        await db.permission.upsert({
          where: { key: permission.key },
          update: { description: permission.description },
          create: { key: permission.key, description: permission.description },
        });
      }
    });
  }

  /**
   * Creates the five system roles (spec §22) for a newly-registered organization, wired up
   * with their default permission grants. Idempotent per organization. Pass `db` (a
   * transaction client) when calling this as part of a larger atomic operation.
   */
  async seedSystemRolesForOrganization(
    organizationId: string,
    db: Db = this.prisma,
  ): Promise<Record<string, string>> {
    await this.ensurePermissionCatalog(db);

    const permissions = await TenantContextStore.runUnscoped(() => db.permission.findMany());
    const permissionIdByKey = new Map(permissions.map((p) => [p.key, p.id]));

    const roleIdByName: Record<string, string> = {};

    for (const roleName of Object.values(SYSTEM_ROLES)) {
      const role = await db.role.upsert({
        where: { organizationId_name: { organizationId, name: roleName } },
        update: {},
        create: { organizationId, name: roleName, isSystem: true },
      });
      roleIdByName[roleName] = role.id;

      const grantedKeys = SYSTEM_ROLE_PERMISSIONS[roleName];
      await db.rolePermission.deleteMany({ where: { roleId: role.id } });
      await db.rolePermission.createMany({
        data: grantedKeys
          .map((key) => permissionIdByKey.get(key))
          .filter((id): id is string => Boolean(id))
          .map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }

    this.logger.log(`Seeded system roles for organization ${organizationId}`);
    return roleIdByName;
  }

  /** Effective permission keys for a user, across all their role assignments. */
  async getEffectivePermissions(userId: string, outletId?: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: {
        userId,
        OR: [{ outletId: null }, ...(outletId ? [{ outletId }] : [])],
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const permissionKeys = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.permissions) {
        permissionKeys.add(rolePermission.permission.key);
      }
    }
    return Array.from(permissionKeys);
  }
}
