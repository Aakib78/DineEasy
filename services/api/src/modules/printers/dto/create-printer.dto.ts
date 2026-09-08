import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePrinterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['KITCHEN', 'RECEIPT'])
  type!: 'KITCHEN' | 'RECEIPT';

  @IsOptional()
  @IsIn(['NETWORK', 'USB'])
  connectionType?: 'NETWORK' | 'USB';

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsInt()
  port?: number;

  @IsOptional()
  @IsString()
  stationId?: string;
}
