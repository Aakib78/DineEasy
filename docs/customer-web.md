# Customer web (`apps/customer_web`)

## What this is

The no-signup QR ordering PWA a diner opens by scanning the code on their table (spec §4/§6/§12
— see docs/qr-ordering.md for the backend contract this app is built against). Vite + React +
TypeScript, no server-side rendering — it's a static bundle served from anywhere (including,
eventually, `services/api` itself) that talks to the API entirely client-side.

## What's built

- **Session bootstrap** (`src/routes/ResolveRoute.tsx`, `src/lib/session/SessionContext.tsx`):
  `/q/:token` exchanges the table's opaque QR token for a dining-session bearer token via
  `POST /qr/:token/resolve`, then redirects to `/menu`. The token and table/outlet context are
  held in React state and mirrored to `sessionStorage` — deliberately `sessionStorage`, not
  `localStorage`, so the session's lifetime matches the browser tab's, consistent with the
  backend minting a fresh `guestToken` per tab that scans (see `QrService` on the backend).
- **Menu browsing + cart** (`src/features/menu`, `src/lib/cart`): `GET /qr/menu` renders into
  categories → items → an item detail sheet for variant/modifier selection, respecting each
  modifier group's `minSelect`/`maxSelect`/`isRequired` client-side (the server independently
  re-validates the same rules at order time — this is UX polish, not the source of truth). The
  cart itself is `sessionStorage`-only client state, per docs/qr-ordering.md — nothing is
  created server-side until "Place order."
- **Price estimate** (`src/lib/cart/price-estimate.ts`): item-subtotal-only, computed with
  `decimal.js` rather than floats (same discipline as the backend's money handling — see
  docs/database.md), explicitly labeled "estimated" in the UI. Tax/service-charge/discount are
  never computed client-side; `OrdersService` on the backend is the only authority on the final
  total, exactly as for POS/Waiter orders.
- **Order placement + tracking** (`src/lib/api/orders.ts`,
  `src/features/order-status/OrderStatusScreen.tsx`): `POST /qr/orders` places the order (table/
  session/guestToken come from the bearer token, never the request body — see
  `CreateGuestOrderDto`'s doc comment on the backend, which exists specifically so a guest can't
  spoof another table). The tracking screen shows a status stepper (Placed → Confirmed →
  Preparing → Ready → Served) and stays live two ways: a WebSocket subscription to
  `RealtimeGateway`'s `session:<diningSessionId>` room for an instant refetch hint
  (`src/lib/realtime/useOrderUpdates.ts`), and a 15s poll as a fallback for when the socket
  never connects (a captive portal, a proxy blocking WebSocket upgrades) — this is the piece
  docs/qr-ordering.md flagged as "not yet built" when that doc was first written; it's built now
  and that doc has been updated to match.

## What's explicitly not built

Online payment (spec says "pay at counter, or online payment when configured" — no gateway is
wired up in v1 anywhere in this codebase, see `docs/payments.md`), any form of guest account or
order history across visits (spec §4/§64 — a dining session's guest identity doesn't persist
past that session, by design), a service worker / installable-PWA manifest (the app is a PWA in
the "works great on mobile web, no install required" sense, not yet in the
add-to-home-screen/offline-cache sense — that's a reasonable follow-up once the rest of the
ordering flow has been used for real), and multi-language support (menu content is whatever
language staff entered it in).

## Running it

```bash
cd apps/customer_web
cp .env.example .env.local   # point VITE_API_BASE_URL at your running services/api
npm install                  # from the repo root, so it resolves as an npm workspace
npm run dev
```

## Verification status

Unlike the Flutter staff app (docs/flutter-app.md), **this one was actually built and verified
in this environment** — Node and the npm registry are both reachable here, so this isn't subject
to the Prisma-engine-class sandbox restriction documented elsewhere. Concretely: `npm run build`
(`tsc -b && vite build`) passes clean, `npm run lint` (`oxlint`) reports zero errors (three
accepted stylistic warnings — a fetch-in-effect pattern and two React-Fast-Refresh-boundary
notices from co-locating a context provider with its hook, both common, intentional patterns),
and the built output was smoke-tested by actually serving it (`vite preview`) and confirming it
returns a working HTML shell. What has **not** been verified is a real end-to-end run against a
live `services/api` (that needs `prisma generate`, which this sandbox can't do — see
docs/troubleshooting.md) — the API contracts above were read directly from the backend source
(controllers, DTOs, Prisma schema), not exercised over the network.
