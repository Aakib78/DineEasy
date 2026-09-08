import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTableDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional()
  @IsIn(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'DISABLED'])
  status?: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DISABLED';
}
