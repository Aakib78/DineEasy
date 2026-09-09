/**
 * Centralized brand palette — the single source of truth for color across every DineEasy web
 * surface (`apps/customer_web`, `apps/pos_web`, and any future staff/admin web app). Before
 * this file existed, `apps/customer_web/src/index.css` was the only place these values lived;
 * building a second web app (`apps/pos_web`) meant either copy-pasting that `:root` block
 * (drifts silently the moment one gets tweaked and the other doesn't) or centralizing it once,
 * here, which is what this does.
 *
 * Kept in sync BY HAND with two things that can't import a TypeScript module:
 *   - `apps/restaurant_app/lib/app.dart`'s `colorSchemeSeed: Color(0xFFE85D2C)` — same accent,
 *     same reasoning as the existing `lib/core/rbac/permissions.dart` "mirrored by hand, no
 *     shared codegen pipeline for Dart yet" tradeoff (see docs/architecture.md §13).
 *   - each web app's own `index.css` `:root` block, which keeps a literal fallback copy of
 *     these exact values — see `applyTheme`'s doc comment below for why the fallback exists.
 */
export const theme = {
  accent: '#e85d2c',
  accentDark: '#c94a1f',
  text: '#1c1917',
  textMuted: '#78716c',
  bg: '#fafaf9',
  surface: '#ffffff',
  border: '#e7e5e4',
  dangerBg: '#fef2f2',
  dangerText: '#b91c1c',
  veg: '#16a34a',
  nonveg: '#dc2626',
  /**
   * Order/payment status colors — canonical hex equivalents of the ad hoc Material
   * `Colors.blue.shade700` / `Colors.green.shade700` / `Colors.orange.shade700` values
   * `apps/restaurant_app/lib/features/billing/billing_screen.dart` has used since before this
   * file existed. New web UI (billing boards, order-status badges) should reach for these
   * named tokens instead of picking its own one-off status color per screen.
   */
  statusInfo: '#1d4ed8',
  statusSuccess: '#15803d',
  statusWarning: '#c2680a',
} as const;

export type ThemeTokens = typeof theme;

const CSS_VAR_NAMES: Record<keyof ThemeTokens, string> = {
  accent: '--accent',
  accentDark: '--accent-dark',
  text: '--text',
  textMuted: '--text-muted',
  bg: '--bg',
  surface: '--surface',
  border: '--border',
  dangerBg: '--danger-bg',
  dangerText: '--danger-text',
  veg: '--veg',
  nonveg: '--nonveg',
  statusInfo: '--status-info',
  statusSuccess: '--status-success',
  statusWarning: '--status-warning',
};

/**
 * Writes every token in `theme` onto `document.documentElement` as a CSS custom property, so
 * app stylesheets keep using `var(--accent)` etc. exactly as they did before this file
 * existed — this only changes where the *value* comes from (one shared object instead of each
 * app's own hand-typed `:root` block). Call once, as early as possible in each app's entry
 * point — before the first render — so nothing ever paints with the un-themed browser default.
 * See `apps/customer_web/src/main.tsx` and `apps/pos_web/src/main.tsx`.
 *
 * Each app's `index.css` still declares the same values on its own literal `:root` block as a
 * static fallback (kept in sync by hand, same convention as the Dart mirror noted above) —
 * belt-and-braces for the odd case a script fails to run before paint (a slow connection
 * serving the JS bundle after the stylesheet, say); in normal operation this function's
 * `setProperty` calls simply override those fallback values with the identical numbers, so
 * there is nothing to visually reconcile.
 *
 * `overrides` exists for a future per-outlet branding feature (spec territory, not built in
 * v1) — passing nothing applies the stock palette unchanged.
 */
export function applyTheme(overrides: Partial<ThemeTokens> = {}): void {
  if (typeof document === 'undefined') return;
  const merged = { ...theme, ...overrides };
  const root = document.documentElement.style;
  for (const key of Object.keys(merged) as (keyof ThemeTokens)[]) {
    root.setProperty(CSS_VAR_NAMES[key], merged[key]);
  }
}
