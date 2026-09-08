import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS, ALL_PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantContextStore } from '../../common/context/tenant-context';

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  /** The fixed permission catalog — used by the Staff → Roles admin UI to render checkboxes. */
  @Get('permissions')
  @RequirePermission(PERMISSIONS.STAFF_VIEW)
  listPermissions() {
    return ALL_PERMISSIONS;
  }

  /** Roles available in the current organization (system roles + any custom ones). */
  @Get()
  @RequirePermission(PERMISSIONS.STAFF_VIEW)
  async listRoles() {
    const organizationId = TenantContextStore.requireOrganizationId();
    return this.prisma.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }
}
