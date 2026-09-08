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
- **Wire types** (`src/lib/api/types.ts`): now a one-line re-export of `@dineeasy/shared-types`
  (`packages/shared_types`, an npm workspace) rather than this app's own hand-duplicated copy —
  see docs/architecture.md §13 for why that package's types are still hand-written rather than
  generated from the backend's OpenAPI spec (`docs/api.md`), and for how this move was verified
  end-to-end (`tsc -b && vite build` and `oxlint` both still pass) despite this sandbox's
  Prisma restriction, since neither touches the database.
- **Installable PWA** (`vite.config.ts`, `public/icon-*.png`): `vite-plugin-pwa` (Workbox under
  the hood) now generates a real `manifest.webmanifest` and service worker at build time, so the
  app is add-to-home-screen installable with a standalone window, not just "works great on
  mobile web." Deliberately scoped to *installability and a fast-loading precached app shell*,
  not offline ordering: the service worker precaches only the built static assets (JS/CSS/HTML/
  icons/manifest — Workbox's default `globPatterns` scope, which never looks past the `dist`
  build output) and has zero `runtimeCaching` rules, so every `/api/*` call still goes straight
  to the network, untouched by the service worker — confirmed by inspecting the generated
  `dist/sw.js` directly rather than assuming the config did what it says (see Verification
  status below). This is a deliberate design match, not an oversight: docs/offline-mode.md is
  explicit that the guest side has no offline queue ("an order the kitchen never sees isn't
  useful to queue for later"), and a service worker that silently cached or replayed API calls
  would quietly violate that. `registerType: 'autoUpdate'` reloads onto the latest build in the
  background rather than prompting — there's no persistent guest account or long-lived state to
  protect from a surprise reload (session/cart both live in `sessionStorage`, scoped to one
  sitting), so always running the newest build beats risking a stale cached ordering flow.
  Icons (`icon-192.png`/`icon-512.png`/`icon-maskable-512.png`) are rendered from the existing
  `public/favicon.svg` mark via `rsvg-convert`; the maskable variant pads the glyph onto a
  `#e85d2c` (the app's actual accent color, matching `index.html`'s `theme-color` and
  `src/index.css`'s `--accent`) square background well inside the safe zone, so it survives a
  circular/squircle OS icon mask without clipping.

## What's explicitly not built

Online payment (spec says "pay at counter, or online payment when configured" — no gateway is
wired up in v1 anywhere in this codebase, see `docs/payments.md`), any form of guest account or
order history across visits (spec §4/§64 — a dining session's guest identity doesn't persist
past that session, by design), and multi-language support (menu content is whatever language
staff entered it in). Installability (above) is done; actual offline *ordering* is not, and by
design never will be on the guest side — see docs/offline-mode.md.

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

The PWA build (`vite-plugin-pwa`) is verified the same concrete way, not just configured and
assumed correct: `npm run build` actually produces `dist/manifest.webmanifest` and `dist/sw.js`,
and both were read directly rather than trusted — the manifest's icons/colors/`start_url` match
what `vite.config.ts` declares, and `dist/sw.js` was inspected to confirm its only
`registerRoute` call is the SPA navigation fallback (`NavigationRoute`, `denylist: [/^\/api\//]`)
with zero runtime-caching routes registered for anything else, i.e. no `/api/*` traffic is ever
intercepted. `npm audit` flags two moderate/high advisories in `vite-plugin-pwa`'s own build-time
dependency chain (`ajv`, `picomatch`, both used only by `workbox-build` while generating the
service worker at build time — neither ships to the browser or runs against user input) — a
known, low-risk, dev-tooling-only item, not something `npm audit fix` resolves without a version
bump this session hasn't attempted to verify doesn't break the build. What's **not** verified:
actually installing the built app on a phone/desktop and confirming the OS install prompt and
standalone launch behave as expected — this sandbox has no browser to do that in, only the build
output and generated files to inspect.
