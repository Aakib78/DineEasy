import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Role name within this organization, e.g. "Manager", "Cashier", "Waiter", "Kitchen". */
  @IsString()
  roleName!: string;

  /** null/omitted = org-wide role (Owner only, in practice — enforced in service logic). */
  @IsOptional()
  @IsUUID()
  outletId?: string;
}
