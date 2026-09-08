import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Scaffold for a future online-payment gateway (spec §10 "provider-independent, webhook-
 * idempotent"). No v1 provider actually posts to this endpoint yet — v1's cash/UPI/card
 * payments are staff-confirmed at the counter via `RecordPaymentDto` (see docs/payments.md
 * for why: a static UPI QR / physical card machine has no API to call back into DineEasy).
 * This exists so that wiring in a real gateway later needs zero schema or idempotency work.
 */
export class ProviderWebhookDto {
  @IsString()
  paymentId!: string;

  @IsString()
  providerEventId!: string;

  @IsIn(['SUCCEEDED', 'FAILED'])
  status!: 'SUCCEEDED' | 'FAILED';

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
