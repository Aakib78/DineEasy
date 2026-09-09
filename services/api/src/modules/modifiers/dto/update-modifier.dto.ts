import { IsBoolean, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateModifierDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsNumber() priceDelta?: number;
  /** Deactivating removes it from new selections without touching historical orders — `OrderItemModifier`
   * snapshots name/priceDelta at order time (see docs/database.md), so this is always safe. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}
