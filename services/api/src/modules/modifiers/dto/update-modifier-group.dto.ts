import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateModifierGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) minSelect?: number;
  @IsOptional() @IsInt() @Min(0) maxSelect?: number;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
