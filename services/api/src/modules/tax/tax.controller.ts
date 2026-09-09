import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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

  // `includeInactive` defaults off — see the identical comment on ModifiersController.list for
  // why this is opt-in rather than a behavior change for the pre-existing caller.
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeInactive') includeInactive?: string) {
    return this.taxService.listForOutlet(requireActiveOutlet(user), includeInactive === 'true');
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
