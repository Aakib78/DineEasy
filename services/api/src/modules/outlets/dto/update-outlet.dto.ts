import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateOutletDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() fssaiLicense?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) serviceChargePercent?: number;
  @IsOptional() @IsBoolean() roundOffEnabled?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
