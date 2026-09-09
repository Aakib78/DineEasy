import { Type } from 'class-transformer';
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
  MinLength,
  ValidateNested,
} from 'class-validator';

class VariantInput {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumber()
  @Min(0)
  priceOverride!: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateMenuItemDto {
  // Not @IsUUID(): MenuCategory.id/TaxGroup.id/ModifierGroup.id are plain `String @id
  // @default(uuid())` columns, and seeded demo data (prisma/seed.ts) deliberately overrides
  // that default with human-readable ids (e.g. "demo-cat-starters") for stable, idempotent
  // upserts across reseeds — see the identical reasoning on CreateOrderDto's menuItemId in
  // orders/dto/create-order.dto.ts, caught the same way (a real request against seeded data).
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() imageUrl?: string;

  @IsNumber()
  @Min(0)
  basePrice!: number;

  @IsOptional() @IsString() @IsNotEmpty() taxGroupId?: string;
  @IsOptional() @IsBoolean() isVegetarian?: boolean;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;

  /** Optional variants created alongside the item, e.g. Small/Medium/Large. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInput)
  variants?: VariantInput[];

  /** Modifier groups (spice level, toppings, ...) to attach to this item on creation. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  modifierGroupIds?: string[];
}
