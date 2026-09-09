import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { CreateKitchenStationDto } from './dto/create-station.dto';
import { UpdateKitchenStationDto } from './dto/update-station.dto';
import { UpdateKitchenItemStatusDto } from './dto/update-kitchen-item-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PERMISSIONS } from '../../common/rbac/permissions.catalog';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { requireActiveOutlet } from '../../common/utils/require-active-outlet.util';

@Controller()
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('kitchen/queue')
  @RequirePermission(PERMISSIONS.KITCHEN_VIEW)
  listQueue(@CurrentUser() user: AuthenticatedUser, @Query('stationId') stationId?: string) {
    return this.kitchenService.listQueue(user.organizationId, requireActiveOutlet(user), stationId);
  }

  @Patch('kitchen/items/:id/status')
  @RequirePermission(PERMISSIONS.KITCHEN_UPDATE)
  updateItemStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateKitchenItemStatusDto,
  ) {
    return this.kitchenService.updateItemStatus(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }

  @Post('kitchen/stations')
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  createStation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateKitchenStationDto) {
    return this.kitchenService.createStation(
      user.organizationId,
      requireActiveOutlet(user),
      dto,
      user.userId,
    );
  }

  @Get('kitchen/stations')
  @RequirePermission(PERMISSIONS.KITCHEN_VIEW)
  listStations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.kitchenService.listStations(requireActiveOutlet(user), includeInactive === 'true');
  }

  @Patch('kitchen/stations/:id')
  @RequirePermission(PERMISSIONS.SETTINGS_MANAGE)
  updateStation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateKitchenStationDto,
  ) {
    return this.kitchenService.updateStation(
      user.organizationId,
      requireActiveOutlet(user),
      id,
      dto,
      user.userId,
    );
  }
}
