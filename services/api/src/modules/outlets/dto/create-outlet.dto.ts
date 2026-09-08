import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOutletDto {
  @IsString()
  @MinLength(2)
  name!: string;

  /** Short code, unique per organization — used in order/KOT/invoice numbers (e.g. "DED"). */
  @IsString()
  @MinLength(2)
  code!: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() fssaiLicense?: string;
}
