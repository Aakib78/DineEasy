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

**Not built yet**: every actual feature screen (POS order entry, table layout, KDS, billing,
reports, staff management), offline/local-cache behavior (tracked with the LAN/offline backend
slice — docs/offline-mode.md), push/local notifications, and the Windows/Android platform
scaffolding itself (see below).

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
correctness (including a couple of real mistakes caught and fixed during that review — e.g.
`int.clamp()` returning `num`, not `int`, in `home_shell.dart`), but that is not a substitute
for the analyzer and test runner actually running. The two pure-Dart test files under
`test/core/auth/` (`jwt_decoder_test.dart`, `access_token_claims_test.dart`) have zero Flutter
widget or platform-channel dependency and should be the first thing to run once the SDK is
available:

```bash
cd apps/restaurant_app
flutter pub get
flutter test test/core/auth
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
