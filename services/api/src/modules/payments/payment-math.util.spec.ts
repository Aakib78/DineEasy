import {
  sumSucceededPayments,
  evaluatePaymentAttempt,
  determinePaymentStatusAfterRefund,
} from './payment-math.util';

describe('sumSucceededPayments', () => {
  it('returns "0" for no payments at all', () => {
    expect(sumSucceededPayments([])).toBe('0');
  });

  it('sums only SUCCEEDED payments, ignoring other statuses', () => {
    const total = sumSucceededPayments([
      { status: 'SUCCEEDED', amount: { toString: () => '300.00' } },
      { status: 'FAILED', amount: { toString: () => '50.00' } },
      { status: 'PENDING', amount: { toString: () => '75.00' } },
      { status: 'SUCCEEDED', amount: { toString: () => '150.00' } },
    ]);
    expect(total).toBe('450');
  });
});

describe('evaluatePaymentAttempt', () => {
  it('a fresh order with a partial payment: remaining reflects what is left, not fully settled', () => {
    const result = evaluatePaymentAttempt({
      orderTotal: '1000.00',
      alreadyPaid: '0',
      attemptedAmount: '400.00',
    });
    expect(result.remaining).toBe('1000');
    expect(result.alreadyFullyPaid).toBe(false);
    expect(result.exceedsRemaining).toBe(false);
    expect(result.fullySettlesOrder).toBe(false);
  });

  it('a payment that exactly covers the remaining balance settles the order', () => {
    const result = evaluatePaymentAttempt({
      orderTotal: '1000.00',
      alreadyPaid: '400.00',
      attemptedAmount: '600.00',
    });
    expect(result.remaining).toBe('600');
    expect(result.fullySettlesOrder).toBe(true);
    expect(result.exceedsRemaining).toBe(false);
  });

  it('a payment larger than the remaining balance is flagged as exceeding it', () => {
    const result = evaluatePaymentAttempt({
      orderTotal: '1000.00',
      alreadyPaid: '400.00',
      attemptedAmount: '700.00',
    });
    expect(result.exceedsRemaining).toBe(true);
    expect(result.remaining).toBe('600');
  });

  it('an order already fully paid is flagged, with remaining clamped to 0 rather than negative', () => {
    const result = evaluatePaymentAttempt({
      orderTotal: '1000.00',
      alreadyPaid: '1000.00',
      attemptedAmount: '1.00',
    });
    expect(result.alreadyFullyPaid).toBe(true);
    expect(result.remaining).toBe('0');
  });

  it('handles a split payment scenario across two guests, second call finishing the order', () => {
    // Guest A pays 300 of a 500 total; guest B then pays the remaining 200.
    const first = evaluatePaymentAttempt({
      orderTotal: '500.00',
      alreadyPaid: '0',
      attemptedAmount: '300.00',
    });
    expect(first.fullySettlesOrder).toBe(false);

    const second = evaluatePaymentAttempt({
      orderTotal: '500.00',
      alreadyPaid: '300.00',
      attemptedAmount: '200.00',
    });
    expect(second.fullySettlesOrder).toBe(true);
    expect(second.exceedsRemaining).toBe(false);
  });
});

describe('determinePaymentStatusAfterRefund', () => {
  it('a refund smaller than the original payment is PARTIALLY_REFUNDED', () => {
    expect(determinePaymentStatusAfterRefund('300.00', '200.00')).toBe('PARTIALLY_REFUNDED');
  });

  it('a refund equal to the original payment is REFUNDED', () => {
    expect(determinePaymentStatusAfterRefund('300.00', '300.00')).toBe('REFUNDED');
  });

  it('a processed-refund total that exceeds the original payment amount still resolves REFUNDED, not an error', () => {
    // Shouldn't normally happen (a refund shouldn't be approvable past the payment's own
    // amount), but the function's job is comparison, not validating how it got here — >= means
    // this doesn't need its own separate "overshoot" status.
    expect(determinePaymentStatusAfterRefund('300.00', '300.01')).toBe('REFUNDED');
  });
});
