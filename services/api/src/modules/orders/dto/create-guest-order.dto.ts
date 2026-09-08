import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateOrderItemDto } from './create-order.dto';

/**
 * Deliberately has NO `tableId`/`type`/`source` field — a guest's dining session token
 * already pins the table (`DiningSessionGuard` verifies it server-side), so trusting a
 * client-supplied table id here would let a malicious guest place an order against a table
 * they never scanned. `OrdersGuestController` fills those in from `request.diningSession`.
 */
export class CreateGuestOrderDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
