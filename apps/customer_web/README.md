# DineEasy — customer web

The no-signup QR ordering PWA a diner opens by scanning the code on their table. See
[`docs/customer-web.md`](../../docs/customer-web.md) at the repo root for what's built, what
isn't, and how it was verified, and [`docs/qr-ordering.md`](../../docs/qr-ordering.md) for the
backend contract this app is built against.

## Development

```bash
cp .env.example .env.local   # point VITE_API_BASE_URL at your running services/api
npm install                  # from the repo root, so it resolves as an npm workspace
npm run dev
```

## Scripts

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — type-checks (`tsc -b`) then produces a production bundle in `dist/`.
- `npm run lint` — `oxlint`.
- `npm run preview` — serves the production build locally, for a final sanity check.
