import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateFloorDto } from './dto/create-floor.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post('floors')
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  createFloor(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFloorDto) {
    return this.tablesService.createFloor(user.organizationId, requireActiveOutlet(user), dto, user.userId);
  }

  @Get('floors')
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  listFloors(@CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.listFloors(requireActiveOutlet(user));
  }

  @Post('tables')
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  createTable(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTableDto) {
    return this.tablesService.createTable(user.organizationId, requireActiveOutlet(user), dto, user.userId);
  }

  @Get('tables')
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  listTables(@CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.listTables(requireActiveOutlet(user));
  }

  @Get('tables/:id')
  @RequirePermission(PERMISSIONS.TABLES_VIEW)
  getTable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tablesService.getTableById(requireActiveOutlet(user), id);
  }

  @Patch('tables/:id')
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  updateTable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.updateTable(user.organizationId, requireActiveOutlet(user), id, dto, user.userId);
  }

  @Post('tables/:id/qr/regenerate')
  @RequirePermission(PERMISSIONS.TABLES_MANAGE)
  regenerateQr(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tablesService.regenerateQrCode(user.organizationId, requireActiveOutlet(user), id, user.userId);
  }
}
