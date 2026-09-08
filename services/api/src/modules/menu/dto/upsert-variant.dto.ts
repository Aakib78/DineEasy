import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpsertVariantDto {
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
