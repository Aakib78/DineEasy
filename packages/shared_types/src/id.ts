/**
 * `crypto.randomUUID()` only exists in a "secure context" (HTTPS or `localhost`) per the Web
 * Crypto spec — but DineEasy's web apps are deliberately served over plain HTTP on the
 * restaurant's own LAN (docs/architecture.md §1, "LAN-first" — no TLS in v1). On a real phone
 * loading `http://192.168.1.49:5173/q/...`, `window.isSecureContext` is false and
 * `crypto.randomUUID` is simply `undefined` — calling it directly (as
 * `apps/customer_web`'s "Add to cart" handler used to) threw a silent `TypeError` with zero
 * visible feedback: the button just appeared to do nothing. Caught live testing on a real
 * device over the restaurant's Wi-Fi, not in a dev sandbox (every request there goes through
 * `localhost`, which *is* a secure context — see docs/troubleshooting.md).
 *
 * Moved here (out of `apps/customer_web/src/lib/id.ts`, which now just re-exports this) once
 * `apps/pos_web` needed the exact same client-generated-id behavior for its own in-memory
 * cart (`lib/cart/pos-cart-types.ts`) — centralizing it here means a second LAN-served web app
 * gets this fix by construction instead of by whoever writes it remembering to copy it.
 *
 * Generates an id the same way `crypto.randomUUID()` would, but via `crypto.getRandomValues`
 * instead, which — unlike the higher-level convenience wrapper — *is* available in an insecure
 * context. Falls all the way back to a non-cryptographic id only if even that is somehow
 * unavailable; safe here because every caller only needs uniqueness within one client's own
 * in-memory state for the duration of one page load, never a security boundary.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
