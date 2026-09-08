import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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
  @IsUUID()
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

  @IsOptional() @IsUUID() taxGroupId?: string;
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
  @IsUUID('4', { each: true })
  modifierGroupIds?: string[];
}
