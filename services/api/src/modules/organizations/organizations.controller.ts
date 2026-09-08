import { Body, Controller, Get, Patch } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.getById(user.organizationId);
  }

  @Patch('me')
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(user.organizationId, dto, user.userId);
  }
}
