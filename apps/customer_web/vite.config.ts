import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-updates the service worker in the background and reloads on the next navigation
      // rather than prompting "a new version is available" — this app has no persistent guest
      // account to protect from a surprise reload (state lives in sessionStorage, scoped to one
      // sitting, see lib/session/SessionContext.tsx), so there's no real cost to always running
      // the latest build, and a stale cached QR-ordering flow is a worse failure mode than an
      // occasional unprompted refresh.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'DineEasy',
        short_name: 'DineEasy',
        description: 'Order food at your table — no app download, no signup.',
        theme_color: '#e85d2c',
        background_color: '#ffffff',
        display: 'standalone',
        // A guest always *arrives* via a scanned/shared "/q/:token" link, never via this
        // start_url directly — but that's fine specifically because of how the router already
        // handles "/" (see App.tsx's RootRoute): with an active session it redirects straight
        // to /menu, and with none (the common case for a fresh install launch, since the
        // session lives in sessionStorage and doesn't outlive one sitting) it shows ScanPrompt,
        // which already tells the guest to scan the table's code. Installing this app doesn't
        // need to preserve a session across visits to be useful — it wasn't designed to, by the
        // same sessionStorage choice — so there was nothing extra to wire up here.
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precaches only the built static app shell (JS/CSS/HTML/icons/manifest) — the default
        // `globPatterns` scope, which only ever looks at files in the `dist` build output, never
        // at network paths. Deliberately zero `runtimeCaching` entries: this service worker must
        // never intercept or cache `/api/*` traffic (orders, menu, QR resolution, ...), since
        // docs/offline-mode.md is explicit that the guest side has no offline queue — "an order
        // the kitchen never sees isn't useful to queue for later." What installability and
        // precaching buy here is a fast-loading, installable app shell over the LAN, not offline
        // ordering; `navigateFallbackDenylist` is a second, explicit guard against `/api/*` ever
        // being served the cached `index.html` fallback (navigation requests only hit this in
        // the first place, so a data `fetch()` to `/api/...` was never at risk, but the intent
        // is worth stating twice given how much this design decision matters).
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
