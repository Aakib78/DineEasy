import { IsIn, IsNumber, Min } from 'class-validator';

export class RecordPaymentDto {
  @IsIn(['CASH', 'UPI', 'CARD', 'OTHER'])
  method!: 'CASH' | 'UPI' | 'CARD' | 'OTHER';

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
