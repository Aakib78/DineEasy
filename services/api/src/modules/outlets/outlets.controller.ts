import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OutletsService } from './outlets.service';
import { CreateOutletDto } from './dto/create-outlet.dto';
import { UpdateOutletDto } from './dto/update-outlet.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Controller('outlets')
export class OutletsController {
  constructor(private readonly outletsService: OutletsService) {}

  @Post()
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOutletDto) {
    return this.outletsService.create(user.organizationId, dto, user.userId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.outletsService.listForOrganization(user.organizationId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.outletsService.getById(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOutletDto,
  ) {
    return this.outletsService.update(user.organizationId, id, dto, user.userId);
  }
}
