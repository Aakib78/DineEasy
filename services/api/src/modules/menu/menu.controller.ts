import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { MenuService } from './menu.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpsertVariantDto } from './dto/upsert-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  getFullTree(@CurrentUser() user: AuthenticatedUser) {
    return this.menuService.getFullTree(requireActiveOutlet(user));
  }

  @Post('categories')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.menuService.createCategory(
      user.organizationId,
      requireActiveOutlet(user),
      dto,
      user.userId,
    );
  }

  @Patch('categories/:id')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.menuService.updateCategory(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }

  @Post('items')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMenuItemDto) {
    return this.menuService.createItem(
      user.organizationId,
      requireActiveOutlet(user),
      dto,
      user.userId,
    );
  }

  @Get('items/:id')
  @RequirePermission(PERMISSIONS.MENU_VIEW)
  getItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.menuService.getItemById(requireActiveOutlet(user), id);
  }

  @Patch('items/:id')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menuService.updateItem(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }

  @Post('items/:id/variants')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertVariantDto,
  ) {
    return this.menuService.addVariant(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }

  @Patch('items/:id/variants/:variantId')
  @RequirePermission(PERMISSIONS.MENU_EDIT)
  updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.menuService.updateVariant(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      variantId,
      dto,
      user.userId,
    );
  }
}
