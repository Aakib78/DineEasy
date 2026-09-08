import { IsIn } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

/** The staff entry point (POS terminal or the Flutter Waiter app) declares which one it is. */
export class CreateStaffOrderDto extends CreateOrderDto {
  @IsIn(['POS', 'WAITER'])
  source!: 'POS' | 'WAITER';
}
