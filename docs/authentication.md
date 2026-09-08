# Authentication & authorization

## Login flow

1. Staff app calls `POST /api/v1/auth/login` with `email` + `password` (scoped to one `organizationId` — resolved from the email's organization at login, since staff belong to exactly one organization).
2. Password is checked with `argon2.verify` against `User.passwordHash` (Argon2id, not bcrypt — chosen for its better memory-hardness against GPU cracking on a field where a stolen restaurant-server DB backup would otherwise be low-effort to crack).
3. On success: a short-lived **access token** (JWT, 15 min default, `JWT_ACCESS_TTL`) is returned in the response body, plus a long-lived **refresh token** (opaque random string; only its SHA-256 hash is stored in `refresh_tokens.tokenHash`, never the raw token) is returned for the client to store securely (Flutter secure storage) and use against `POST /api/v1/auth/refresh`.
4. The access token's claims carry `sub` (userId), `organizationId`, and the resolved permission set at issue time — so most authorization checks don't need a DB round-trip; a role change takes effect on the user's next token refresh, not mid-session, which is an explicit, documented tradeoff for POS responsiveness.

## Refresh & device/session management

Each refresh token row records `deviceInfo` (a client-supplied device label, e.g. "POS-Counter-1 / Android") and `ipAddress`, and can be individually revoked (`revokedAt`) — giving an Owner/Manager device-level session visibility ("Staff → Devices") without needing a heavier session store. Refresh tokens rotate: `POST /api/v1/auth/refresh` issues a new refresh token and revokes the old one, so a leaked-then-stolen refresh token is only usable once before the legitimate client's next refresh invalidates it and (in a future hardening pass) can trigger a reuse-detected alert.

`POST /api/v1/auth/logout` revokes the current session's refresh token; a future "log out everywhere" revokes all of a user's tokens.

## RBAC

- `Role` is organization-scoped (seeded with five system roles at org creation — Owner, Manager, Cashier, Waiter, Kitchen — matching spec §22; an org can add custom roles later).
- `Permission` is a global, fixed catalog of string keys (`orders.create`, `orders.cancel`, `orders.discount`, `payments.refund`, `reports.view`, `menu.edit`, `staff.manage`, `settings.manage`, …) seeded once.
- `RolePermission` joins them; `UserRole` assigns a role to a user, optionally scoped to one `outletId` (null = all outlets — used for Owner).
- Enforcement is a `@RequirePermission('orders.cancel')` decorator + `PermissionsGuard`, never a hard-coded `if (user.role === 'MANAGER')` check in a handler. The guard resolves the user's effective permission set for the request's target outlet from the JWT claims (see above) and denies with `403` if missing.

## Tenant isolation

Every authenticated request runs through a `TenantContextInterceptor` that derives `{organizationId, outletId?}` from the verified JWT (never from the request body/query) and exposes it to request-scoped services. See `docs/architecture.md` §3 for the Prisma-level enforcement that makes a missing tenant filter fail closed.

## QR / customer identity

Customers never authenticate. A table QR resolves to a `DiningSession` (§ Dining sessions, `docs/qr-ordering.md`); each browser tab is given a random, unguessable `guestToken` held client-side, which scopes that guest's cart/orders within the session without collecting any personal information (spec §4: no forced signup, no forced phone number).

## Planned, not yet built (see `docs/architecture.md` §15)

OTP login, passkeys, SSO — explicitly deferred per spec §21 to avoid overbuilding v1 auth.
