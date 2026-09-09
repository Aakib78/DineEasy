import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateVariantDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsNumber() @Min(0) priceOverride?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** Deactivating a variant hides it from new orders — spec-consistent soft delete, same as
   * every other `isActive` flag in this domain (docs/database.md). It was a schema column with
   * no endpoint ever setting it until now. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}
