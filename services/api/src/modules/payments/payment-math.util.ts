import Decimal from 'decimal.js';

/**
 * Pure logic extracted out of `PaymentsService` specifically so it's testable without a Prisma
 * client — same reasoning as `orders/order-pricing.util.ts` and `billing/invoice-tax.util.ts`
 * (see those files' doc comments, and `docs/troubleshooting.md` for why this sandbox can't run
 * anything needing `@prisma/client`'s generated types). Split/partial-payment and refund math
 * is exactly the kind of decimal arithmetic worth actually running against cases, not just
 * reading — a wrong remaining-balance calculation either blocks a legitimate payment or lets an
 * order settle for less than it owes.
 */

/** Sums every `SUCCEEDED` payment's amount — payments in any other status don't count toward
 * what's actually been collected (a `FAILED` or `PENDING` payment left no money on the table). */
export function sumSucceededPayments(
  payments: { status: string; amount: { toString(): string } }[],
): string {
  return payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum.plus(p.amount.toString()), new Decimal(0))
    .toString();
}

export interface PaymentAttemptEvaluation {
  /** What's still owed *before* this attempt is applied, as a decimal string (never negative —
   * clamped to "0" once fully paid, so callers don't have to guard against a stray negative). */
  remaining: string;
  /** The order was already fully paid before this attempt — nothing here should be applied. */
  alreadyFullyPaid: boolean;
  /** This attempt's amount is more than `remaining` — nothing here should be applied. */
  exceedsRemaining: boolean;
  /** `alreadyPaid + attemptedAmount` covers the order total — the caller should settle the
   * order (PAID → COMPLETED) once this payment is actually recorded. */
  fullySettlesOrder: boolean;
}

/**
 * Evaluates one `recordPayment`/webhook-settlement attempt against an order's running total.
 * Deliberately returns a result object rather than throwing — `PaymentsService` decides what to
 * do with `alreadyFullyPaid`/`exceedsRemaining` (including the exact error message, which needs
 * `remaining` formatted into it), keeping this function's job purely arithmetic.
 */
export function evaluatePaymentAttempt(input: {
  orderTotal: string;
  alreadyPaid: string;
  attemptedAmount: string;
}): PaymentAttemptEvaluation {
  const total = new Decimal(input.orderTotal);
  const alreadyPaid = new Decimal(input.alreadyPaid);
  const attempted = new Decimal(input.attemptedAmount);

  const remainingRaw = total.minus(alreadyPaid);
  const remaining = remainingRaw.lt(0) ? new Decimal(0) : remainingRaw;

  return {
    remaining: remaining.toString(),
    alreadyFullyPaid: remainingRaw.lte(0),
    exceedsRemaining: attempted.gt(remaining),
    fullySettlesOrder: alreadyPaid.plus(attempted).gte(total),
  };
}

/**
 * After approving one refund, decides whether the *payment* it belongs to is now fully
 * `REFUNDED` or only `PARTIALLY_REFUNDED` — compares the running total of every `PROCESSED`
 * refund against that payment's original amount (a payment can be refunded across more than one
 * approval, e.g. a manager approves ₹200 now and ₹100 later on a ₹300 payment).
 */
export function determinePaymentStatusAfterRefund(
  paymentAmount: string,
  totalProcessedRefundAmount: string,
): 'REFUNDED' | 'PARTIALLY_REFUNDED' {
  return new Decimal(totalProcessedRefundAmount).gte(new Decimal(paymentAmount))
    ? 'REFUNDED'
    : 'PARTIALLY_REFUNDED';
}
