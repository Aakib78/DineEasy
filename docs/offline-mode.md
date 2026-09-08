# Offline / LAN-first mode

This is the core differentiator (spec §15) — see `docs/architecture.md` §7 for the high-level design. This document goes one level deeper into *how* offline resilience actually works, and is the reference for the failure-mode acceptance tests in spec §43/§69.

## What "offline" means here — two different failures

1. **Internet is down, LAN is fine.** The restaurant's ISP connection drops, but the DineEasy server, POS tablets, KDS, and customer phones are all still on the same working LAN/router. This is the *primary* scenario DineEasy is built for. Everything except online payments and future cloud sync keeps working with zero degradation, because none of those flows ever left the LAN in the first place.
2. **The LAN/server itself is unreachable from a device.** Wi-Fi dropped on one tablet, or the server process/machine itself is down. This is more serious — that device can't reach the kitchen or other terminals either. The app must make this failure loud and clear (a banner, not a silent retry queue that never resolves), because unlike scenario 1, staff need to know *right now* that this order won't reach the kitchen until reconnected.

## Server side

The entire `docker-compose.yml` stack (api + postgres + redis) runs on the restaurant's own LAN. No P0 code path (`docs/architecture.md` §1's module list minus `PaymentsModule`'s online-provider branch) makes an outbound internet call. `PaymentsModule`'s `ManualPaymentProvider` (`docs/payments.md`) is itself fully offline-capable since it never calls out.

## Flutter client side — local storage + outbox

The restaurant app keeps a local Drift (SQLite) database with three kinds of state:

- **Cached reference data**: menu, tables, tax config, staff roster — refreshed opportunistically whenever connected, always readable even when not.
- **Active operational state**: in-progress orders, table statuses — mirrors server state, updated both by direct writes and by WebSocket-triggered refetches (`docs/architecture.md` §8).
- **Mutation outbox**: every write-intent (create order, add item, update KOT status, take payment) is appended here first, with a client-generated `idempotencyKey` (UUID), *before* it's sent to the server. The UI updates optimistically off this local write. A background sync worker drains the outbox in order, POSTing/PATCHing to the API with that same idempotency key on every attempt — including retries — so a request that actually succeeded server-side but timed out on the response never gets double-applied (the server's `orders_outletId_idempotencyKey_key` unique constraint, `docs/database.md`, makes a retried create a no-op that returns the original order). Failed sends retry with exponential backoff (capped) and stay visible in a "Sync issues" view rather than failing silently — spec §29/§51/§52.

## Customer web / QR side

The guest's phone talks directly to the LAN server for every action — there is no offline queue on the guest side. If the server becomes unreachable mid-order, the guest sees a clear "can't reach the restaurant right now" screen with retry, not a spinner or a silently-lost order. This is intentional: an order the kitchen never sees isn't useful to queue for "later."

## Local network discovery

Manually typing a LAN IP every shift doesn't scale to non-technical staff. The plan (tracked as in-progress in `docs/architecture.md` §15) is mDNS/Bonjour service discovery: the DineEasy server advertises `_dineeasy._tcp` (see `MDNS_SERVICE_NAME`/`MDNS_SERVICE_TYPE` in `.env.example`) and the Flutter app browses for it on launch, falling back to a manual "Enter server address" screen when discovery finds nothing (unsupported router, mDNS blocked between VLANs, etc.) — discovery is a convenience, never a hard dependency, per spec §17.

## Failure-mode checklist (spec §43/§69)

| Failure | Expected behavior |
|---|---|
| Internet down, LAN up | POS/menu/tables/orders/KOT/KDS/billing/local QR/local reports/printing all continue normally; online-payment option is hidden/disabled with a clear "online payment unavailable — use cash/UPI/card at counter" message |
| Server process restart | In-flight requests fail fast with a retryable error; clients reconnect automatically once the health check passes again; no data loss (Postgres is the source of truth, nothing important lived only in memory) |
| Postgres restart | API returns 503 on DB-dependent routes during the outage window; recovers automatically once Postgres is back |
| Redis unavailable | Rate limiting/WebSocket fan-out/idempotency-cache degrade (see `docs/architecture.md` §1 — Redis is never the source of truth), but order/menu/billing correctness is unaffected since those always go through Postgres |
| Duplicate order submission | No-op via `idempotencyKey` (above) |
| Duplicate payment webhook | No-op via `PaymentTransaction.providerEventId` uniqueness (`docs/payments.md`) |
| Device disconnect mid-order | Outbox retries once reconnected; order isn't lost |
| WebSocket reconnect | Client re-fetches affected resources on reconnect rather than trusting it missed nothing (`docs/architecture.md` §8) |
| Printer unavailable | Job stays `QUEUED`/`FAILED` in the print queue; order/billing flow is unaffected (`docs/printing.md`) |
| Concurrent orders/table access | Table/session state changes are transactional; order numbering uses row-level locking (`docs/database.md` — `outlet_daily_counters`) to avoid collisions under concurrent POS terminals |

Automated tests for this table are tracked under Task "Backend: automated tests" — see `docs/architecture.md` §15 for what's implemented vs. still planned.
