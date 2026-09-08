/**
 * Claims inside a customer/QR "dining session token" — issued by QrService on QR scan
 * (docs/qr-ordering.md), attached to `request.diningSession` by DiningSessionGuard. This is
 * intentionally a separate, narrower token type from the staff AccessTokenPayload: it proves
 * "this browser is legitimately part of dining session X at table Y", nothing more — there is
 * no user identity behind it (spec §4: no forced signup).
 */
export interface GuestSessionPayload {
  diningSessionId: string;
  organizationId: string;
  outletId: string;
  tableId: string;
  /** Distinguishes multiple guests at the same table/session — see docs/architecture.md §6. */
  guestToken: string;
}
