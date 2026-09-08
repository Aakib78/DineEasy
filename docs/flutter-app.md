# Staff app (`apps/restaurant_app`)

## What this is

The Flutter app staff actually touch: POS at the counter, the floor/tables view, the kitchen
display, billing, reports, staff management. Targets Android tablets (the primary device — see
spec §2/§60) and Windows for a back-office desktop, both talking to `services/api` over the
restaurant's own LAN (docs/architecture.md §1).

## What's built vs. planned

This slice is **foundation + auth** — the scaffolding every later feature slice (POS, Tables,
Kitchen/KDS, Billing, Reports) builds on top of, not those features themselves:

- **Networking**: `ApiClient` (`lib/core/network/api_client.dart`) — a configured `Dio` that
  attaches `Authorization: Bearer <token>` to every request, and on a 401 calls
  `POST /auth/refresh` once and retries the original request (coalescing concurrent 401s into a
  single refresh call, since the backend's refresh tokens rotate — see
  docs/authentication.md — and a second concurrent refresh attempt would be using an
  already-revoked token). Every failure is normalized into an `ApiException`
  (`lib/core/network/api_exception.dart`) so feature code never has to know Dio.
- **Auth**: `AuthRepository` (login/refresh/logout against `AuthController`) and
  `AuthSessionNotifier` (`lib/core/auth/auth_session.dart`), a Riverpod `StateNotifier` that is
  the single source of truth for "who's signed in, with what permissions" — every screen reads
  `ref.watch(currentUserProvider)` rather than holding its own copy.
- **Token storage**: `SecureTokenStorage` (`lib/core/storage/token_storage.dart`) — access and
  refresh tokens live in the OS keychain (`flutter_secure_storage`), never in plain
  SharedPreferences, per spec §21 ("bearer tokens are treated like passwords"). Client claims
  (name, email, permissions, `activeOutletId`) are read by decoding the JWT payload locally
  (`lib/core/auth/jwt_decoder.dart`) — the backend has no separate "who am I" endpoint, and this
  is safe because the app never trusts a token it didn't just receive from its own request to
  `services/api`; every subsequent API call is still independently verified server-side.
- **RBAC (client-side)**: `lib/core/rbac/permissions.dart` mirrors
  `services/api/src/common/rbac/permissions.catalog.ts` by hand (no shared codegen pipeline for
  Dart yet — see docs/architecture.md §13). This is used **only** to decide what the UI shows
  (e.g. hiding the POS tab from Kitchen staff) — it is not, and must never be treated as, a
  security boundary. `PermissionsGuard` on the server is the actual enforcement, on every
  request, unconditionally.
- **Routing**: `go_router`, with a `redirect` driven by `AuthSessionNotifier`'s state
  (`lib/core/routing/app_router.dart`) — unauthenticated → `/login`, authenticated → `/home`,
  and a `/splash` route while the app is still checking for a stored session on cold start.
- **Home shell**: `lib/features/home/home_shell.dart` — a permission-filtered navigation shell
  (NavigationRail on wide/desktop layouts, a bottom NavigationBar on narrow/tablet-portrait
  layouts) around placeholder screens for POS/Tables/Kitchen/Billing/Reports/Staff/Settings.
  Each placeholder becomes a real screen in its own later slice; nothing in the shell needs to
  change when that happens.

- **POS** (`lib/features/pos/`) — the first real feature screen beyond the nav shell. Two screens:
  `PosHomeScreen` (a floor-by-floor table grid, color-coded via `TableTile` — green/available,
  amber/reserved, orange/occupied-or-has-an-open-order — plus a "Takeaway" entry point) and
  `OrderBuilderScreen` (category-tabbed menu browsing, `ItemCustomizeSheet` for variant/modifier
  selection, a `CartPanel` docked at the bottom, and a submit that calls either
  `POST /orders` for a brand-new order or `POST /orders/:id/items` when the tapped table already
  has one open — decided by cross-referencing the active-orders list `PosHomeScreen` fetched
  before navigating in). Data layer: `MenuRepository`/`TablesRepository`/`OrdersRepository`
  (`lib/features/pos/data/`) wrapping the same three endpoints the customer PWA and POS UI both
  ultimately price through (`OrdersService` on the backend is the sole pricing authority — see
  `lib/core/money/money.dart`'s doc comment; every total shown while building a cart here is a
  client-side *estimate*, recomputed for real the moment the order is actually created).
  `PosCartNotifier` (`lib/features/pos/state/pos_cart.dart`) is `autoDispose` on purpose — leaving
  the POS flow (back to the table grid) always starts the next order with an empty cart, since a
  leftover cart from a previous table would be a real correctness hazard, not just a UX nit.
  Two bugs were caught during hand-review of this slice (see "Verification status" below for what
  that review process can and can't catch): `menu_item_tile.dart` originally picked a
  multi-variant item's "from" price by comparing *formatted* price strings
  (`'₹150.00'.compareTo('₹99.00')`) instead of the actual amounts, which sorts wrong for any pair
  of prices that differ in digit count — fixed by giving `Money` real comparison operators
  (`Comparable<Money>`, `<`, `<=`, ...) and comparing values, not strings. Separately,
  `PosCartLine.lineId` was initially just `DateTime.now().microsecondsSinceEpoch.toString()`,
  which a fast enough double-tap could collide on — fixed with `nextCartLineId()`
  (`lib/features/pos/data/pos_cart_line.dart`), which appends a monotonic in-memory counter.

- **Tables management** (`lib/features/tables/tables_management_screen.dart`) — floor/table
  *setup*, distinct from the POS's read-only table picker above: add a floor, add a table to a
  floor (name + seat count), edit an existing table (rename, change seat count, change `status`
  — `AVAILABLE`/`OCCUPIED`/`RESERVED`/`DISABLED`, a manual staff override independent of whether
  an order actually exists), and rotate a table's QR token (`POST /tables/:id/qr/regenerate`) —
  any dining session already open on that table is unaffected by a rotation, only future scans
  see the new token. Reuses the POS feature's `Floor`/`RestaurantTable`/`TablesRepository`
  rather than a second copy of the same models (`pos_models.dart` gained `RestaurantTable.qrCode`
  and `RestaurantTable.displayOrder` for this screen's benefit; the POS floor view ignores both).
  The create/edit controls are additionally gated on `tables.manage` (not just the `tables.view`
  that unlocks the tab itself) so a view-only role doesn't see buttons that are guaranteed to
  403 — UX only, per usual; `PermissionsGuard` on the server is the actual enforcement.

- **Kitchen display (KDS)** (`lib/features/kitchen/kds_screen.dart`) — a horizontally-scrolling
  board of KOT "tickets" (`_TicketCard`), oldest first, each item advanceable through
  NEW → PREPARING → READY → COMPLETED (or CANCELLED at any point before COMPLETED) via
  `PATCH /kitchen/items/:id/status`; a ticket drops off the board once every item on it is
  COMPLETED/CANCELLED (`KdsTicket.hasActiveItems`, mirroring the backend's own queue filter — see
  `KitchenService.listQueue`'s `notIn: ['COMPLETED', 'CANCELLED']` on the server). `Order.status`
  itself is never touched from here — the backend derives it from item-level progress
  (`KitchenService.recomputeOrderStatus`); this screen only ever writes kitchen-item status.
  Ticket headers color-code by elapsed time (green/amber/red at 5/10-minute thresholds — a
  reasonable default, not a spec-pinned number) and a station filter (`ChoiceChip` row) narrows
  the board to one `KitchenStation` at a time. **No WebSocket wiring on the Flutter side yet** —
  unlike the customer PWA's `useOrderUpdates.ts`, this screen keeps the board live with a plain
  `Timer.periodic` re-fetch every 6 seconds rather than a real-time subscription; adding
  `socket_io_client` to the staff app is a reasonable follow-up once there's a second screen that
  would also benefit from it (Billing's live order feed is the next candidate). Update controls
  are further gated on `kitchen.update` (the tab itself only needs `kitchen.view`) for the same
  view-only-role reason as Tables management above. New pure-logic tests:
  `test/features/kitchen/kds_models_test.dart` (9 tests — JSON parsing, `hasActiveItems`, and the
  `kitchenItemStatusToJson` guard against NEW as an illegal target status).

**Not built yet**: Billing, Reports, Staff management, offline/local-cache behavior (tracked with
the LAN/offline backend slice — docs/offline-mode.md), push/local notifications, and the
Windows/Android platform scaffolding itself (see below).

## Why there's no `android/`, `ios/`, or `windows/` folder here

Those are machine- and Flutter-SDK-version-specific generated projects (Gradle wrapper files,
`AndroidManifest.xml`, CMake files for Windows, and so on) — `flutter create` generates them
from a template tied to the Flutter SDK version doing the generating. Hand-authoring them risks
committing a subtly-wrong or stale scaffold that fights whatever Flutter version actually builds
this. The correct, standard way to get them is to run, once, on a machine with the Flutter SDK
installed:

```bash
cd apps/restaurant_app
flutter create . --platforms=android,windows --org com.dineeasy
flutter pub get
```

Run inside an *existing* project like this, `flutter create` only adds the missing platform
folders — it does not touch `lib/`, `pubspec.yaml`, or anything else already here.

## Verification status

**Not verified in this environment.** This sandbox has no Flutter or Dart SDK installed, and
outbound network access to fetch one is blocked at the proxy allowlist (the same class of
restriction documented in docs/troubleshooting.md for `prisma generate` — see that doc for the
general pattern this project follows: write deliberately correct code by hand, review it
carefully, and say plainly what could not be machine-verified rather than silently assuming
success). Concretely, nobody has run `flutter pub get`, `flutter analyze`, `flutter test`, or
`flutter run` against this code yet. Every file was reviewed by hand for type and syntax
correctness (including several real mistakes caught and fixed during that review — e.g.
`int.clamp()` returning `num`, not `int`, in `home_shell.dart`, and the two POS bugs described
above), but that is not a substitute for the analyzer and test runner actually running. The
widget screens (`PosHomeScreen`, `OrderBuilderScreen`, `TablesManagementScreen`, `KdsScreen`, and
everything under `lib/features/pos/widgets/`) are the highest-risk code in the app precisely because
hand-review cannot simulate the widget tree, layout constraints, or `Tab`/`TabController`
lifecycle the way `flutter run` or a widget test harness would — treat those as needing the most
scrutiny on first real run. One specific thing to check first: `tables_management_screen.dart`
uses `DropdownButtonFormField`'s `value:` parameter rather than the newer `initialValue:` name,
because `pubspec.yaml`'s SDK floor (`>=3.22.0`, no upper bound) includes Flutter versions that
predate the rename — `value:` should still work as a supported-but-deprecated alias on a newer
SDK too, but that assumption about Flutter's own deprecation window is exactly the kind of thing
this sandbox has no compiler to confirm. The test files under `test/core/auth/`,
`test/core/money/`, and `test/features/` (`jwt_decoder_test.dart`, `access_token_claims_test.dart`,
`money_test.dart`, `pos_cart_test.dart`, `kds_models_test.dart`) have no platform-channel or
rendering dependency — `pos_cart_test.dart` exercises `PosCartNotifier`'s state transitions and
subtotal math directly, `kds_models_test.dart` exercises `KdsTicket`/`KdsTicketItem` JSON parsing
and the active-ticket filter, neither touching a widget — and should be the first thing to run
once the SDK is available:

```bash
cd apps/restaurant_app
flutter pub get
flutter test test/core test/features
flutter analyze
```

## Architecture choices and why

- **Riverpod (`flutter_riverpod`), hand-written, no codegen**: skips a `build_runner` step so
  the app builds with plain `flutter pub get` — revisit `riverpod_generator` once the provider
  graph is large enough that hand-written providers are the bigger maintenance cost, not before.
- **`go_router` over `Navigator` 1.0**: declarative routes plus a single `redirect` callback is
  the cleanest place to encode "auth state decides what screen you're allowed to see," rather
  than scattering `Navigator.pushReplacement` calls through every screen that can end a session.
- **`dio` over `http`**: interceptors are what make token attachment and refresh-and-retry a
  single, testable piece of code instead of every repository re-implementing it.
- **Sealed-class session state** (`AuthSessionState` in `auth_session.dart`): Dart 3 pattern
  matching over `AuthSessionUnknown | Authenticating | Unauthenticated | Authenticated` gives
  the router's redirect logic exhaustiveness checking — adding a fifth state without updating
  the redirect switch is a compile error, not a runtime gap.
