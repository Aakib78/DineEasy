import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
}
