import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class ModifierInput {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  priceDelta?: number;
}

export class CreateModifierGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsInt() @Min(0) minSelect?: number;
  @IsOptional() @IsInt() @Min(0) maxSelect?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ModifierInput)
  modifiers!: ModifierInput[];
}
