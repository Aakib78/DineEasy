import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class OrderItemModifierInput {
  @IsUUID()
  modifierId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateOrderItemDto {
  @IsUUID()
  menuItemId!: string;

  @IsOptional()
  @IsUUID()
  menuItemVariantId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierInput)
  modifiers?: OrderItemModifierInput[];
}

/**
 * `source` is deliberately NOT a client-supplied field — the controller sets it from which
 * route was hit (POS/Waiter staff routes vs. the QR guest route), same principle as
 * tenant IDs never coming from the client (spec §3/§31).
 */
export class CreateOrderDto {
  @IsIn(['DINE_IN', 'TAKEAWAY'])
  type!: 'DINE_IN' | 'TAKEAWAY';

  /** Required for DINE_IN; ignored for TAKEAWAY. */
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Client-generated idempotency key (spec §7/§31 offline-first: a waiter's Flutter app on
   * a flaky LAN may retry a "place order" call it never got a response for). Enforced by a
   * DB unique constraint on (outletId, idempotencyKey) — a retried request with the same key
   * returns the original order rather than creating a duplicate.
   */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
