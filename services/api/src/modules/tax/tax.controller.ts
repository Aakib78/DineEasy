import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TaxService } from './tax.service';
import { CreateTaxGroupDto } from './dto/create-tax-group.dto';
import { UpdateTaxGroupDto } from './dto/update-tax-group.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller('tax-groups')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Post()
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaxGroupDto) {
    return this.taxService.create(user.organizationId, requireActiveOutlet(user), dto, user.userId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.taxService.listForOutlet(requireActiveOutlet(user));
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.taxService.getById(requireActiveOutlet(user), id);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaxGroupDto,
  ) {
    return this.taxService.update(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }
}
