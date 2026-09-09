import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class OrderItemModifierInput {
  // Not @IsUUID(): Modifier.id is `String @id @default(uuid())` in schema.prisma -- a plain
  // string column, with @default(uuid()) only being the value used when none is supplied.
  // Seeded demo data (prisma/seed.ts) deliberately overrides it with a human-readable id
  // (e.g. "demo-mg-spice-mild") for stable, idempotent upserts across reseeds -- @IsUUID()
  // here rejected every seeded modifier outright, caught the first time a real order was
  // actually placed against seeded data (see docs/troubleshooting.md). The real
  // existence/ownership check happens via the Prisma lookup in OrdersService regardless of
  // the id's format, so validating format here was never buying any actual safety.
  @IsString()
  @IsNotEmpty()
  modifierId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateOrderItemDto {
  // See OrderItemModifierInput.modifierId's comment above -- same reasoning, same seed-data
  // shape (MenuItem.id is seeded as e.g. "demo-item-paneer-tikka").
  @IsString()
  @IsNotEmpty()
  menuItemId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
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
