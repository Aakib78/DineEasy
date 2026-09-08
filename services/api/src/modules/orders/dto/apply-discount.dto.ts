import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ApplyDiscountDto {
  @IsIn(['PERCENTAGE', 'FIXED'])
  type!: 'PERCENTAGE' | 'FIXED';

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
