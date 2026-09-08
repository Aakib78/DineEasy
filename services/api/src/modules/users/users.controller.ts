import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
}
