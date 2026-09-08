import { apiRequest } from './client';
import type { MenuCategory, ResolveQrResponse } from './types';

/** Step 1 of docs/qr-ordering.md's guest flow — exchanges the table's opaque QR token for a
 *  dining-session bearer token. No prior session state needed; this is the entry point. */
export function resolveQrToken(token: string): Promise<ResolveQrResponse> {
  return apiRequest<ResolveQrResponse>(`/qr/${encodeURIComponent(token)}/resolve`, {
    method: 'POST',
  });
}

/** Same isAvailable/isActive-filtered menu the POS reads — see docs/qr-ordering.md "Menu availability". */
export function fetchMenu(sessionToken: string): Promise<MenuCategory[]> {
  return apiRequest<MenuCategory[]>('/qr/menu', { sessionToken });
}
