import { IsInt, IsOptional, IsUUID, Min, MinLength } from 'class-validator';
import { IsString } from 'class-validator';

export class CreateTableDto {
  @IsUUID()
  floorId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}
