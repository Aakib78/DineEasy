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

- **Notifications inbox** (`lib/features/notifications/`): a bell icon with an unread-count
  badge in the shell's `AppBar` (both the wide `NavigationRail` layout and the narrow
  `NavigationBar` one — the wide layout didn't have an `AppBar` at all before this, so it
  gained a minimal one just to host the bell), opening `NotificationsScreen` — an All/Unread
  toggle over `GET /notifications`, tap-to-mark-read per row, and a "mark all read" action
  (`PATCH /notifications/read-all`). Deliberately has no per-row navigation to the underlying
  order — the backend gives enough (`entityType`/`entityId`) to add that later, but wiring an
  actual jump-to-order flow is out of scope for "an inbox exists" and would be speculative
  build-ahead. Unlike every other feature screen there's no RBAC gating anywhere in this
  slice — it mirrors `NotificationsController`'s own "authenticated-only" contract on the
  backend (see that file's doc comment), so the bell lives outside the permission-filtered
  `_destinations` list in `home_shell.dart` rather than as a tab. No WebSocket wiring yet
  (same gap as the Kitchen board), so `HomeShell` runs its own 20-second background poll of
  the unread count for as long as the shell is mounted — longer-lived than `KdsScreen`'s 6s
  poll, which only runs while that one screen is open, because an unread badge needs to stay
  current everywhere, not just on one tab. New pure-logic tests:
  `test/features/notifications/notification_models_test.dart` (4 tests — targeted vs. read
  parsing, `isUnread` derivation, and the missing-field/unrecognized-type fallback path, since
  `type` is deliberately a raw string rather than an enum — see the model's doc comment).

- **Staff role-assignment removal**: closes the gap the Staff management bullet above left open
  — the data model always allowed multiple simultaneous role assignments per staff member, but
  there was no way to *remove* one, only add or replace-for-the-same-outlet. `_StaffTile`'s role
  chips (the list view, not the edit sheet's read-only snapshot copy — see that sheet's own new
  doc comment on why removal isn't duplicated there) now use `Chip.onDeleted` to show a delete
  icon, gated on `staff.manage` and further hidden per-chip whenever it's a member's only
  remaining role — mirroring the new backend guard (`DELETE /staff/:id/roles` refuses to leave
  someone with zero role assignments) client-side rather than always round-tripping to find out.
  Deleting one goes through a confirmation `AlertDialog` first — this app's first use of
  `showDialog` anywhere, since every earlier destructive-ish action was a full form submission
  rather than a single tap. `StaffRepository.removeRoleAssignment` added alongside.

- **"Mark served" action** (`OrderBuilderScreen`'s `_ExistingOrderBanner`, `OrdersRepository.serve`): closes a real gap caught on the very first live end-to-end order (see `docs/troubleshooting.md`) — the backend has always had `POST /orders/:id/serve` (`READY` → `SERVED`), but nothing in the app ever called it. The Kitchen board only drives an order to `READY` (see `KITCHEN_DRIVEN_PATH` in `services/api/src/modules/kitchen/kitchen.service.ts` — it deliberately never sets `SERVED` itself, since the kitchen has no way to know when a waiter actually carries the food out), so an order that had every kitchen item marked Done just sat at `READY` forever: the table kept showing an open order, and Billing never offered it (it only lists `SERVED` orders — see that screen's own doc comment). Added a "Mark served" button to the existing-order banner shown when continuing an order for an occupied table, visible only when `order.status == OrderStatus.ready`, the signed-in user has `orders.update`, and no serve call is already in flight — same permission the backend enforces, same "hide rather than disable" UI convention as the rest of this app.

- **Realtime WebSocket wiring** (`lib/core/realtime/`): closes the "no WebSocket wiring on the Flutter side yet" gap flagged throughout this doc and in `docs/architecture.md` §15/§8 — the customer PWA has had a live nudge (`useOrderUpdates.ts`) since it was built; the staff app had none, leaning entirely on `Timer.periodic` polling (KDS, 6s) or nothing at all (POS home, Billing — only refreshed on the screen's own actions or a manual pull-to-refresh). `RealtimeService` (`lib/core/realtime/realtime_service.dart`) is a thin `socket_io_client` wrapper around `RealtimeGateway`'s existing `/realtime` namespace, authenticating with the same staff access token already used for REST calls; one instance is shared for the whole session (`realtimeServiceProvider`), connected/disconnected from `HomeShell`'s `initState`/`dispose` (the shell that's only ever mounted while authenticated), and each feature screen just subscribes to whichever event stream(s) it cares about in its own `initState`. Wired in: `PosHomeScreen` (`order.updated`/`table.updated` — this is what now makes "Order open" clear live once an order is paid off, instead of only after a manual pull-to-refresh; see `docs/troubleshooting.md`'s "table.status and Order open are independent signals" entry for the mechanic this keeps current), `BillingScreen` (`order.updated` — converted from `ConsumerWidget` to `ConsumerStatefulWidget` for this), and `KdsScreen` (`kitchen.queue_updated`/`order.updated`, layered on top of its existing 6s poll rather than replacing it). Deliberately additive everywhere, never a replacement for the existing polling — see `RealtimeService`'s own doc comment for why (a missed/out-of-order event, a proxy blocking WebSocket upgrades, a captive portal — the polling is what keeps each screen eventually correct regardless). Backend-side, `PaymentsService.recordPayment` now also emits `order.updated` for every recorded payment, not only ones that fully settle the order — previously only `transitionStatus`'s own emit covered the "fully settled" case, so a partial/split payment update would sit invisible on other screens until the order was eventually fully paid. `apps/customer_web/src/lib/realtime/useOrderUpdates.ts` was the template for all of this. Not yet verified in this environment — no Flutter/Dart SDK here, same limitation as every other Flutter-side change in this doc — pending confirmation from a real run (needs `flutter pub get` to pull in the newly-added `socket_io_client` dependency).

- **Settings screen + Printers** (`lib/features/settings/settings_screen.dart`,
  `lib/features/printers/`): closes the last placeholder destination in the nav shell — see
  `docs/architecture.md` §15, which corrected an earlier assumption that Settings had "no
  dedicated requirements beyond sign-out": printer setup is a real, recurring operational need
  that, until now, only existed in `apps/pos_web`. `SettingsScreen` is a small hub (account
  info, sign-out, and a Printers entry) rather than the Printers screen itself, since Settings
  is reachable by every signed-in staff member (`requiredPermission: null` in
  `home_shell.dart`) while printer management is `printers.manage`-gated — the entry is hidden
  (not just disabled) for anyone without it, same convention as the rest of this app.
  `PrintersScreen`/`PrintersRepository`/printer models are a direct port of
  `apps/pos_web/src/features/printers/PrintersScreen.tsx`, same fields (name, KITCHEN/RECEIPT,
  NETWORK/USB, IP/port), same backend (`POST`/`GET /printers`). Not yet verified in this
  environment — no Flutter/Dart SDK here, same limitation as every other Flutter-side change in
  this doc.

- **Bottom nav trimmed to POS/Kitchen/Billing; Tables/Reports/Staff/Settings moved to the
  drawer** (`home_shell.dart`): direct user request — the phone-layout bottom nav had grown to 7
  tabs (every destination, unfiltered by how often each is actually tapped mid-shift) and felt
  cluttered. `_Destination` gained an `inBottomNav` flag: `true` for the three destinations staff
  hit constantly while working a shift (POS, Kitchen, Billing), `false` for the more occasional
  lookup/admin ones (Tables, Reports, Staff, Settings), which now live in the drawer opened from
  the AppBar's menu icon instead. Selection state is split accordingly — `_selectedPrimaryIndex`
  (which bottom-nav tab) and `_secondaryOverride` (which drawer destination, if any, is currently
  showing instead) are tracked separately, so opening a drawer item doesn't disturb which primary
  tab the bottom nav highlights underneath it once you go back, the same way a drawer item
  doesn't "steal" the tab bar's selection in most apps. The wide/tablet `NavigationRail` layout
  is unchanged — it already lists every destination as a sidebar, not a bottom nav, so there was
  nothing to move there. Not yet verified in this environment — no Flutter/Dart SDK here.

- **Discount and refund cards** (`billing_detail_screen.dart`'s `_DiscountCard`/`_RefundCard`,
  new `features/billing/data/payments_repository.dart` + `state/payments_providers.dart`):
  `orders.discount`/`payments.refund` had backend endpoints with no UI anywhere until now — direct
  port of `apps/pos_web`'s equivalent cards, same behavior. `_DiscountCard` shows the order's (at
  most one, in v1) applied discount read-only, or an apply form (percentage/fixed, optional
  reason) when there isn't one yet and the order isn't financially settled — the backend has no
  remove/replace endpoint, so once applied it's permanent. `_RefundCard` renders once per payment
  that's `SUCCEEDED`/`PARTIALLY_REFUNDED` or already has refund history, computes the refundable
  balance client-side (`amount - sum(PROCESSED refunds)` — the backend doesn't reject an
  over-amount refund itself), and calls `initiateRefund` then `approveRefund` back-to-back as one
  action (v1 requires the same permission for both, no separate approver role). It warns before
  submitting that even a small partial refund flips a PAID/COMPLETED order's whole status to
  REFUNDED — see `docs/payments.md`'s Refunds section. `PaymentSummary`/`Order` in
  `pos_models.dart` gained `refunds`/`discounts` fields to carry data the backend already
  returned but this app never parsed; refund data specifically only comes from the new
  `PaymentsRepository.listForOrder` (`GET /orders/:orderId/payments`), not the `payments` embedded
  on `GET /orders/:id`. Not yet verified in this environment — no Flutter/Dart SDK here.

- **Printer job history/health** (`lib/features/printers/printer_jobs_screen.dart`, new
  `PrintersRepository.listJobs`/`printerJobsProvider`): `GET /printers/:id/jobs` existed with no
  UI consumer since the Printers screen shipped — tapping a printer row in `PrintersScreen` (now
  `onTap` instead of inert) opens this screen: last 50 jobs newest-first (no pagination on the
  endpoint), a Queued/Failed count card, and per-job status/attempts/`lastError`, all computed
  client-side over that fixed window. Direct port of `apps/pos_web`'s equivalent screen, same
  behavior including the "stuck `QUEUED` for 60+ seconds" agent-down warning (a `PrinterJob` only
  ever becomes terminally `FAILED` after 3 retried attempts — an agent that's down or can't reach
  the API never produces a `FAILED` row at all, just a silently growing backlog). New `PrinterJob`
  model in `printers_models.dart`, including `payload: Map<String, dynamic>` (read defensively —
  `orderNumber`/`kotNumber`/`invoiceNumber` in practice, per the backend's enqueue call sites, but
  not guaranteed) since a print job has no order/invoice FK of its own. No backend changes needed.
  See `docs/printing.md`'s "Operator visibility" section. Not yet verified in this environment —
  no Flutter/Dart SDK here.

**Not built yet**: offline/local-cache behavior (tracked with the LAN/offline backend slice —
docs/offline-mode.md), real OS-level push/local notifications (the in-app inbox above is the
step before that — it's a poll-driven bell, not a system notification), and the
Windows/Android platform scaffolding itself (see below). Every permission-gated feature-area
destination in the nav shell (POS, Tables, Kitchen, Billing, Reports, Staff) — and now Settings,
via its Printers entry — has a real screen; there are no placeholder destinations left.

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
