import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateMenuItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) basePrice?: number;
  // Not @IsUUID() — see CreateMenuItemDto's comment on the identical fields: these ids are
  // plain strings, and seeded demo data deliberately uses human-readable ones.
  @IsOptional() @IsString() @IsNotEmpty() taxGroupId?: string;
  @IsOptional() @IsString() @IsNotEmpty() categoryId?: string;
  @IsOptional() @IsBoolean() isVegetarian?: boolean;
  /** Whether it can currently be ordered — spec §12 "availability must be reflected in both POS and QR". */
  @IsOptional() @IsBoolean() isAvailable?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;

  /** If provided, replaces this item's modifier-group associations entirely. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  modifierGroupIds?: string[];
}
