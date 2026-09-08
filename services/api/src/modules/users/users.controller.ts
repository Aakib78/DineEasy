import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Controller('staff')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermission(PERMISSIONS.STAFF_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStaffDto) {
    return this.usersService.create(user.organizationId, dto, user.userId);
  }

  @Get()
  @RequirePermission(PERMISSIONS.STAFF_VIEW)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listForOrganization(user.organizationId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.STAFF_VIEW)
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usersService.getById(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.STAFF_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.usersService.update(user.organizationId, id, dto, user.userId);
  }

  /**
   * `outletId` omitted means the org-wide assignment (mirrors `UpdateStaffDto`'s own
   * `roleName`/`outletId` pairing — see `UsersService.update`'s doc comment) rather than a path
   * segment, since `undefined` cleanly means "the org-wide row" the same way it does on every
   * other role-assignment endpoint here.
   */
  @Delete(':id/roles')
  @RequirePermission(PERMISSIONS.STAFF_MANAGE)
  removeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('outletId') outletId?: string,
  ) {
    return this.usersService.removeRoleAssignment(user.organizationId, id, outletId, user.userId);
  }
}
