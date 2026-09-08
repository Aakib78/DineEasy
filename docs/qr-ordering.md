# QR ordering

## Table QR identity

`TableQrCode.token` is an opaque, unguessable random token (not a signed JWT encoding IDs — a plain high-entropy random string looked up in the DB, so revoking/regenerating it is a single-row update with no key-rotation complexity). The printed/displayed QR encodes `https://<outlet-lan-address>/q/<token>`. The customer web app calls `GET /api/v1/qr/:token/resolve`, which:

1. Looks up an active `TableQrCode` by token (404 + a friendly "this QR code is no longer active" screen if not found/inactive — covers a regenerated or revoked QR).
2. Resolves `{organizationId, outletId, tableId}`.
3. Finds the table's currently `OPEN` `DiningSession`, or creates one.
4. Returns a short-lived **session token** (JWT scoped to that dining session, not a user) for the customer web app to use on subsequent calls — this is what stands in for authentication on the guest side, and what the server uses to verify a placed order actually belongs to a legitimate, currently-open session at that table rather than trusting a client-supplied `tableId`.

Regenerating a table's QR (Admin → Tables → Regenerate QR) invalidates the old token immediately; any dining session tied to the old token that's still open remains valid (regeneration is about the *printed code*, not about kicking out an active session).

## Guest flow

```
Scan QR → GET /q/:token → resolve session → GET menu → build cart (client-side) →
POST /api/v1/orders (source=QR, diningSessionId, guestToken) → poll/subscribe order status →
pay at counter, or online payment (when configured) → order tracking shows COMPLETED
```

The cart itself lives client-side (in memory / `localStorage`) until "Place order" — DineEasy doesn't create a `DRAFT` order for every idle cart, only once the guest actually places it, to avoid cluttering the POS with abandoned orders.

## Multiple guests, one table

Each browser tab that scans the table QR gets its own `guestToken` (random, generated client-side, sent with every order/cart write) but resolves to the *same* `DiningSession` (found by the find-or-create in step 3 above). The POS's table view groups orders by dining session and shows the per-guest breakdown using `guestToken`, so "Guest B added 2 more items" is visible without any of the guests needing to know about each other or log in. See `docs/architecture.md` §6.

## Menu availability

The customer web app reads menu items through the same `isAvailable`/`isActive` flags the POS uses (`docs/architecture.md` §12/§4 of spec) — there is no separate "customer menu" data path that could drift out of sync with what staff see.

## Order tracking

`GET /api/v1/orders/:id` (scoped to the dining session token) plus a WebSocket subscription to that order's room gives live status updates (`docs/architecture.md` §8) without polling, while still falling back to poll-on-reconnect so a flaky guest Wi-Fi connection never leaves the tracking screen stuck.

## What's explicitly out of scope for v1

Customer accounts, saved payment methods, order history across visits, loyalty — none of these exist; a dining session's guest identity does not persist past that session (spec §4, §64).
