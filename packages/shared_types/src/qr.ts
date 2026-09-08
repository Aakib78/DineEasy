/** Mirrors `QrController.resolve` (`services/api/src/modules/qr/qr.controller.ts`) — the
 * no-signup customer entry point's response to a table QR scan. */
export interface ResolveQrResponse {
  sessionToken: string;
  diningSessionId: string;
  guestToken: string;
  table: { id: string; name: string; floorName: string };
  outletName: string;
}
