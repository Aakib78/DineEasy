import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePrintJobStatusDto {
  @IsIn(['SENT', 'ACKED', 'FAILED'])
  status!: 'SENT' | 'ACKED' | 'FAILED';

  @IsOptional()
  @IsString()
  error?: string;
}
