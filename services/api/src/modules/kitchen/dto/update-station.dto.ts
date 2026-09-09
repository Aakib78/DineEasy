import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateKitchenStationDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  /** Deactivating hides it from `listStations` (the KDS station-filter chips) — a station
   * column with no endpoint ever setting it until now. Note: v1 doesn't actually route any KOT
   * to a station yet (every `KitchenOrder.stationId` is created `null` — see
   * `OrdersService.createKitchenOrder`'s doc comment), so today a station exists only as a
   * manual filter on the queue view, not as something orders get assigned to. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}
