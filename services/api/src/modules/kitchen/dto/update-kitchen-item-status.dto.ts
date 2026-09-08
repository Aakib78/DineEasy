import { IsIn } from 'class-validator';

export class UpdateKitchenItemStatusDto {
  @IsIn(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'])
  status!: 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
}
