# Payments

## Abstraction

```
PaymentProvider (interface)
    ├── createIntent(order, method) -> PaymentIntent
    ├── confirm(intentId) -> PaymentTransaction
    └── refund(paymentId, amount) -> Refund

ManualPaymentProvider implements PaymentProvider   # v1 default
RazorpayProvider implements PaymentProvider         # future, behind the same interface
```

`PaymentIntent`, `PaymentTransaction`, and `Refund` are domain types (`services/api/src/modules/payments/domain/`) independent of any vendor SDK — nothing in `OrdersModule` or `BillingModule` imports a payment-vendor type. See `docs/architecture.md` §9.

## v1: manual/staff-confirmed payments

For cash, UPI, and card, DineEasy v1 doesn't integrate a payment gateway — this matches how the large majority of independent Delhi/Faridabad restaurants actually take payment today (cash drawer, a UPI QR code on a stand, or a bank's card machine, all reconciled by the cashier). The `ManualPaymentProvider`:

- Cashier selects method + confirms amount received at the POS.
- Creates a `Payment` row with `status: SUCCEEDED` directly (no external round-trip) once the cashier confirms.
- Still goes through the exact same `PaymentTransaction` audit trail as a future gateway integration would, so switching providers later doesn't change the order/billing domain at all.

## Future: online provider integration

A provider like Razorpay/PhonePe Business slots in behind the same `PaymentProvider` interface. Two things are non-negotiable when that's added (spec §14, §45, §51):

- **Webhook idempotency**: `PaymentTransaction.providerEventId` is unique per `provider`, so a duplicate/retried webhook delivery is a no-op, not a double-applied payment.
- **Webhook authentication**: every webhook handler verifies the provider's signature (HMAC against `PAYMENTS_WEBHOOK_SECRET` or the provider's own scheme) before touching any data, and only ever updates a `PaymentTransaction`/`Payment` row — a webhook can never mark an *order* directly as paid; the order's status transition is a separate, domain-validated step (`docs/architecture.md` §5) that reacts to a payment reaching `SUCCEEDED`.
- **Never trust the client**: a client-side "payment succeeded" callback (from an SDK popup, a redirect return URL, etc.) is only ever used to *refresh the UI* — the authoritative status change comes from the server confirming with the provider (webhook or a server-to-server status check), never from what the browser/app reports.

## Refunds

`Refund` rows are created with `status: PENDING` and require `payments.refund` permission (spec §22) to move to `APPROVED`; a `Refund` never mutates `Payment.amount` directly — the payment's net position is `amount - sum(refunds where status in (APPROVED, PROCESSED))`, computed, not stored, so the audit trail is never lossy.

## Currency

`INR` hardcoded as the *default*, not the *only* value — `Payment.currency` and `Organization.currency` are both plain strings, not enums, so a future non-India deployment doesn't require a schema change (spec §48).
