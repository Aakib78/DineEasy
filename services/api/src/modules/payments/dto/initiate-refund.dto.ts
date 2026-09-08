import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class InitiateRefundDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
