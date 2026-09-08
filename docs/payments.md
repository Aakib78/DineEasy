# Payments

## Abstraction

The provider-independence spec §10 asks for lives in the schema and service boundary, not a
literal `PaymentProvider` TypeScript interface (the originally-sketched design above this
line, before `PaymentsModule` was actually built — see docs/architecture.md §15 "Build
status" for what's implemented vs. planned at any point in time):

```
Payment              # one row per attempt to collect money for an order
  └── PaymentTransaction[]   # raw log of every provider event, unique(provider, providerEventId)
Refund                # amount + status, computed net position (never mutates Payment.amount)
```

`PaymentsService.recordPayment()` is v1's only write path into `Payment` for a live restaurant
(staff-confirmed — see below); `PaymentsService.handleProviderWebhook()` is a second,
already-idempotent write path built for a *future* gateway, exercised by nothing in v1.
Neither `OrdersModule` nor `BillingModule` imports a payment-vendor type or reasons about
*how* a payment was collected — only `PaymentsService` does, so swapping v1's manual flow for
a real gateway later is additive (a new call path into the same tables), not a rewrite. See
`docs/architecture.md` §10.

## v1: manual/staff-confirmed payments

For cash, UPI, and card, DineEasy v1 doesn't integrate a payment gateway — this matches how the large majority of independent Delhi/Faridabad restaurants actually take payment today (cash drawer, a UPI QR code on a stand, or a bank's card machine, all reconciled by the cashier). `PaymentsService.recordPayment()`:

- Cashier selects method + confirms amount received at the POS (`POST /orders/:orderId/payments`).
- Creates a `Payment` row with `status: SUCCEEDED` directly (no external round-trip) once the cashier confirms — plus a `PaymentTransaction` row (`provider: 'manual'`) so the audit trail has the exact same shape a gateway integration would produce.
- Supports split payment: multiple `recordPayment` calls against the same order (e.g. one guest pays cash, another UPI) are summed; the order only advances BILLED→PAID→COMPLETED once the sum of `SUCCEEDED` payments covers `Order.total`.

## Future: online provider integration

A provider like Razorpay/PhonePe Business calls `POST /payments/webhook/:provider` (already implemented, `@Public()`, and idempotent — see `ProviderWebhookDto`'s doc comment for exactly what's built vs. still needed). Two things are non-negotiable when that's added (spec §14, §45, §51):

- **Webhook idempotency**: `PaymentTransaction.providerEventId` is unique per `provider`, so a duplicate/retried webhook delivery is a no-op, not a double-applied payment — **implemented** (`PaymentsService.handleProviderWebhook`, caught via the Postgres unique-violation error code, `P2002`).
- **Webhook authentication**: every webhook handler must verify the provider's signature (HMAC against a provider-specific secret, or the provider's own scheme) before touching any data. **Not yet implemented** — `POST /payments/webhook/:provider` is `@Public()` with no signature check, because there is no real provider account in this environment to validate a scheme against. This is a hard requirement before any real provider is wired in, called out explicitly rather than left implicit; it only ever updates a `PaymentTransaction`/`Payment` row — a webhook can never mark an *order* directly as paid, the order's status transition is a separate, domain-validated step (`docs/architecture.md` §5) that reacts to a payment reaching `SUCCEEDED`.
- **Never trust the client**: a client-side "payment succeeded" callback (from an SDK popup, a redirect return URL, etc.) is only ever used to *refresh the UI* — the authoritative status change comes from the server confirming with the provider (webhook or a server-to-server status check), never from what the browser/app reports.

## Refunds

`Refund` rows are created with `status: PENDING` via `PaymentsService.initiateRefund` and require `payments.refund` permission (spec §22) to approve. v1 has no separate payment-gateway settlement step for a refund, so `approveRefund` collapses "approved" and "processed" into one manager action — the record moves straight to `PROCESSED` (the schema's `APPROVED` state is reserved for a future gateway flow where approval and actual money movement are genuinely separate steps). A `Refund` never mutates `Payment.amount` directly — the payment's net position is `amount - sum(refunds where status = PROCESSED)`, computed at request time, not stored, so the audit trail is never lossy. A payment refunded in full flips the owning order to `REFUNDED`.

## Currency

`INR` hardcoded as the *default*, not the *only* value — `Payment.currency` and `Organization.currency` are both plain strings, not enums, so a future non-India deployment doesn't require a schema change (spec §48).
