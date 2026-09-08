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

- **Billing** (`lib/features/billing/`) — `BillingScreen` lists orders ready to bill (SERVED) or
  already billed and awaiting payment (BILLED/PAID), reusing `activeOrdersProvider` and
  filtering client-side rather than adding a dedicated backend endpoint (`GET /orders` already
  excludes COMPLETED/CANCELLED/REFUNDED). Tapping one opens `BillingDetailScreen`: an item
  breakdown with subtotal/discount/tax/service-charge/total, a "Generate bill" action
  (`POST /orders/:id/invoice`, idempotent on the backend) once SERVED, then a GST tax-line
  breakdown (`_InvoiceCard`, from `GET /orders/:id/invoice`) plus a payment form
  (`POST /orders/:id/payments`) once BILLED — split/partial payments are supported (the backend
  only advances the order past BILLED once the running SUCCEEDED total covers the full amount),
  so the payment amount field defaults to the *remaining* balance, not the order total, and
  re-syncs to a new remaining balance after each partial payment rather than going stale
  (`_RecordPaymentCard`'s `didUpdateWidget`). This screen never sets order/payment status
  directly — the backend derives PAID → COMPLETED automatically once fully paid
  (`PaymentsService.settleOrder`), and the screen just reflects whatever `orderByIdProvider`
  returns after each action. Generate-bill and record-payment controls are further gated on
  `billing.create`/`payments.take` respectively (the tab itself only needs `billing.view`).
  Extended the shared `Order` model (`pos_models.dart`) with `subtotal`/`discountTotal`/
  `taxTotal`/`serviceChargeTotal`/`tableName`/`payments` — all present on every order response
  already (`ORDER_INCLUDE` on the backend), just not previously parsed since nothing needed them
  yet. Also added `Money.operator-` and `Money.toPlainString()` (for prefilling the editable
  amount field) to `lib/core/money/money.dart`. New pure-logic tests:
  `test/features/billing/billing_models_test.dart` (3 tests) plus 4 new `money_test.dart` cases
  covering subtraction and `toPlainString`.

  **A real bug caught during hand-review of this slice**: the amount field's input formatter
  originally used `FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d{0,2}$'))` to cap it at
  two decimal places. That pattern is anchored (`^...$`), and `FilteringTextInputFormatter.allow`
  works by keeping only the *substrings* of the new text that match the pattern — for an
  anchored pattern, a string either matches in full or matches nowhere at all, so one keystroke
  past two decimal places wouldn't just get rejected, it would wipe the *entire* field to empty.
  Fixed with `TextInputFormatter.withFunction`, which reverts to the previous value on a
  non-match instead of stripping non-matching substrings — the correct tool for a
  whole-string-shaped validation pattern.

- **Reports** (`lib/features/reports/`) — `ReportsScreen`, a read-only dashboard over the three
  `reports.view`-gated endpoints (`GET /reports/sales-summary`, `/reports/top-items`,
  `/reports/payment-breakdown`): a `SegmentedButton` picks a date-range preset (Today/Last 7
  days/Last 30 days — `ReportRangePreset`), and three independently-loading `_ReportCard`
  sections render the sales summary (revenue, order/dine-in/takeaway counts, average order
  value, and a subtotal→discount→tax→service-charge→revenue breakdown), the top-selling items
  list (server-ordered and server-limited — this screen doesn't re-sort or re-cap it), and a
  per-payment-method breakdown. `to` is always "now" for every preset, including Today; only how
  far back `from` reaches changes, and Today sends **no** `from` at all rather than the client
  computing its own midnight — `ReportsService.startOfDay` on the backend already does that, and
  reimplementing it here risked a timezone mismatch with the server. No mutating controls exist
  anywhere on this screen, so — unlike POS/Tables/Kitchen/Billing — there's no per-control RBAC
  gating to layer on top of the tab-level `reports.view` check the nav shell already does. New
  pure-logic tests: `test/features/reports/reports_models_test.dart` (6 tests — JSON parsing and
  zero-default handling for all three response shapes).

  **A real bug caught during hand-review of this slice**: the resolved `(from, to)` date range
  was originally computed by a *private* provider (`_resolvedRangeProvider`) that only
  `ref.watch`ed the selected preset — a plain `Provider` recomputes only when something it
  watches changes, and the preset doesn't change on a pull-to-refresh, so `to` (captured via
  `DateTime.now()` inside it) would have stayed frozen at whichever moment the preset was first
  selected. Pulling to refresh would have silently kept re-fetching the exact same stale window
  instead of advancing to the current time, directly contradicting the "captured at call time"
  behavior the provider's own doc comment claimed. Fixed by making the provider non-private
  (`resolvedReportRangeProvider`) and having `ReportsScreen`'s `onRefresh` explicitly invalidate
  it alongside the three report providers, so every pull-to-refresh actually recomputes "now".

- **Staff management** (`lib/features/staff/`) — the last feature-area placeholder to land.
  `StaffScreen` lists every staff account in the organization (`GET /staff`), each showing a
  status badge (Active/Inactive/Suspended) and a chip per role assignment (`"Manager · Connaught
  Place"`, or `"Owner · All outlets"` for an org-wide one). Add-staff and edit-staff bottom
  sheets are gated on `staff.manage` (the tab itself only needs `staff.view`), same UX-only
  pattern as everywhere else. A staff member can hold **more than one** role assignment
  simultaneously — the backend's `UsersService.update` only deletes-and-recreates the
  `UserRole` row matching the *same* `(userId, outletId)` pair it's given, so reassigning
  someone to a different outlet *adds* a role rather than moving their existing one; this is
  surfaced honestly in the UI (role chips show every assignment, not just the latest) and
  documented on `StaffRepository.updateStaff` rather than papered over with a "replace all
  roles" UX the backend doesn't actually support. The edit sheet's role dropdown defaults to a
  `null` "No change" sentinel — deliberately distinct from `null` meaning "org-wide" on the
  outlet dropdown that appears once a role *is* picked — since only explicitly sending
  `roleName` at all is what triggers a reassignment. New repositories: `StaffRepository`
  (`/staff`), `RolesRepository` (`GET /roles`, just enough to populate the role dropdown — not
  the full permission-checkbox admin UI the endpoint's backend doc comment mentions, which is
  out of scope for this slice), `OutletsRepository` (`GET /outlets`, ungated beyond being
  signed in — used only to populate the outlet dropdown). New pure-logic tests:
  `test/features/staff/staff_models_test.dart` (9 tests — JSON parsing, org-wide vs.
  outlet-scoped roles, multiple simultaneous role assignments, the unrecognized-status guard).

  One deliberate deviation from this app's usual `_SheetShell` (`tables_management_screen.dart`,
  duplicated here rather than shared — see its own doc comment): the Staff sheets wrap their
  `Column` in a `SingleChildScrollView`, since the Add-staff sheet alone has six fields
  (name/email/password/phone/role/outlet) and would be a real overflow risk on a short device
  with the keyboard up, unlike the shorter two/three-field sheets in Tables management that the
  original `_SheetShell` was written for.

**Not built yet**: offline/local-cache behavior (tracked with the LAN/offline backend slice —
docs/offline-mode.md), push/local notifications, and the Windows/Android platform scaffolding
itself (see below). Every permission-gated feature-area destination in the nav shell (POS,
Tables, Kitchen, Billing, Reports, Staff) now has a real screen — only Settings remains a
placeholder, and it's expected to stay minimal (spec has no dedicated settings-screen
requirements beyond sign-out, already in the nav shell itself).

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
widget screens (`PosHomeScreen`, `OrderBuilderScreen`, `TablesManagementScreen`, `KdsScreen`,
`BillingScreen`/`BillingDetailScreen`, `ReportsScreen`, `StaffScreen`, and everything under
`lib/features/pos/widgets/`) are the highest-risk code in the app precisely because hand-review
cannot simulate the widget tree, layout constraints, or `Tab`/`TabController`/`SegmentedButton`
lifecycle the way `flutter run` or a widget test harness would — treat those as needing the most
scrutiny on first real run. Specific things to check first: `tables_management_screen.dart` uses
`DropdownButtonFormField`'s `value:` parameter rather than the newer `initialValue:` name,
because `pubspec.yaml`'s SDK floor (`>=3.22.0`, no upper bound) includes Flutter versions that
predate the rename — `value:` should still work as a supported-but-deprecated alias on a newer
SDK too, but that assumption about Flutter's own deprecation window is exactly the kind of thing
this sandbox has no compiler to confirm; `billing_detail_screen.dart`'s `_RecordPaymentCard`
relies on `didUpdateWidget` re-syncing a `TextEditingController` after a partial payment (see the
Billing section above) — worth specifically exercising a split-payment flow on first real run,
since that's exactly the kind of stateful-widget-lifecycle interaction hand-review is least
reliable at; and `reports_screen.dart`'s `SegmentedButton<ReportRangePreset>` reuses the same
Material 3 widget already confirmed compatible with this SDK floor in Billing's payment-method
selector, but pull-to-refresh on the Reports tab (`resolvedReportRangeProvider`'s invalidation —
see the Reports section above) is worth specifically exercising too, since that's exactly the
class of "provider only recomputes when something it watches changes, not on a timer" bug that
hand-review is good at catching in isolation but easy to miss end-to-end without actually running
the refresh gesture; and `staff_screen.dart`'s two nullable `DropdownButtonFormField<String?>`
dropdowns (role/outlet, both using a `null`-valued item as a "No change"/"Org-wide" sentinel) are
this app's first use of that pattern — every earlier dropdown in this codebase has a non-nullable
value — so worth a specific look even though it's a standard, well-documented Flutter idiom.
The test files under `test/core/auth/`, `test/core/money/`, and `test/features/`
(`jwt_decoder_test.dart`, `access_token_claims_test.dart`, `money_test.dart`,
`pos_cart_test.dart`, `kds_models_test.dart`, `billing_models_test.dart`,
`reports_models_test.dart`, `staff_models_test.dart`) have no platform-channel or rendering
dependency — `pos_cart_test.dart` exercises `PosCartNotifier`'s state transitions and subtotal
math directly, `kds_models_test.dart` exercises `KdsTicket`/`KdsTicketItem` JSON parsing and the
active-ticket filter, `billing_models_test.dart` exercises `Invoice` JSON parsing,
`reports_models_test.dart` exercises `SalesSummary`/`TopItem`/`PaymentBreakdownLine` JSON parsing
and zero-default handling, `staff_models_test.dart` exercises `StaffMember` JSON parsing
including multiple simultaneous role assignments and the unrecognized-status guard, none
touching a widget — and should be the first thing to run once the SDK is available:

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
