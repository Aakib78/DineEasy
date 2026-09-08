import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateStaffDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED']) status?:
    'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

  /** If provided together, replaces this user's role assignment for the given outlet. */
  @IsOptional() @IsString() roleName?: string;
  @IsOptional() @IsUUID() outletId?: string;
}
