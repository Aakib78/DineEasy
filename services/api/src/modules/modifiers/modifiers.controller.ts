import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ModifiersService } from './modifiers.service';
import { CreateModifierGroupDto } from './dto/create-modifier-group.dto';
import { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller('modifier-groups')
export class ModifiersController {
  constructor(private readonly modifiersService: ModifiersService) {}

  @Post()
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateModifierGroupDto) {
    return this.modifiersService.create(
      user.organizationId,
      requireActiveOutlet(user),
      dto,
      user.userId,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.modifiersService.listForOutlet(requireActiveOutlet(user));
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.modifiersService.getById(requireActiveOutlet(user), id);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
  ) {
    return this.modifiersService.update(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }
}
