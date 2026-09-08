# Troubleshooting

## Development / build environment

### `prisma migrate dev`, `prisma generate`, or `prisma format` fails with a 403 from `binaries.prisma.sh`

Prisma's CLI downloads a Rust "schema-engine" / "query-engine" binary from `binaries.prisma.sh` on first use. Some sandboxed or locked-down networks (including the cloud environment this project was originally scaffolded in) block that host by policy. Symptoms:

```
Error: Failed to fetch the engine file at https://binaries.prisma.sh/... - 403 Forbidden
```

Fixes, in order of preference:
1. Run the Prisma command from a machine/network that can reach `binaries.prisma.sh` (a normal laptop with regular internet access works fine — this is specifically a sandboxed-CI/restricted-egress problem, not a bug in the project).
2. If you're behind a corporate proxy, allowlist `binaries.prisma.sh` (schema/migrate engine) — Prisma's engine downloads are a hard dependency for `migrate dev`, `generate`, `format`, `studio`, and `db pull`.
3. As a last resort for applying the already-committed initial schema: run `services/api/prisma/migrations/20260908000000_init/migration.sql` directly with `psql` against your target database — it's been validated to apply cleanly on Postgres 16 and needs no Prisma engine at all. This only helps for the *existing* migration; you still need a working Prisma CLI to author new ones.

This does not affect the running application — the generated `@prisma/client` code, once built on a machine that could reach the engine host, works everywhere the app itself runs (including fully offline on a restaurant LAN, per `docs/offline-mode.md`).

### `docker compose up` fails to reach the internet inside a build (`apt-get`/`npm install` errors during `docker build`)

If you're on a restricted network, Docker's build containers may not inherit your proxy settings. Either configure `~/.docker/config.json` `proxies`, or pass `--build-arg HTTP_PROXY=...`/`HTTPS_PROXY=...` matching your environment.

## Runtime

### Flutter app shows "Can't connect to DineEasy Server"

1. Confirm the server is actually running: `docker compose -f infrastructure/docker/docker-compose.yml ps` should show `api` as healthy.
2. Confirm the device is on the same LAN/SSID as the server (guest Wi-Fi vs staff Wi-Fi matters — see `docs/architecture.md` §1).
3. Try manual connection (Settings → Server Connection → Enter address) with the server's LAN IP and port `3000` if LAN discovery hasn't found it — see `docs/offline-mode.md` for how discovery works and why it can fail on some routers.
4. Check the in-app System Status screen — it reports API/DB/Redis reachability independently, which narrows down whether the problem is network or the server process itself.

### Customer can't load the QR menu on the restaurant's guest Wi-Fi

This is almost always a guest-network isolation setting on the restaurant's router (client isolation / AP isolation), which by design prevents guest devices from reaching *anything* else on the LAN, including the DineEasy server. See `docs/deployment.md` for the guest-network requirement; the fix is a router configuration change, not a DineEasy change.

### Duplicate orders after a retry / spotty connection

Shouldn't happen — order creation is idempotent on a client-generated key (`docs/offline-mode.md`, `docs/api.md`). If you do see it, please capture the `x-request-id` from both requests (visible in the API logs) and file it as a bug; this is treated as a correctness-critical failure per spec §51.

## Where to look for logs

- API: structured JSON logs (pino) to stdout, each line carrying `requestId`. `docker compose logs -f api`.
- Postgres/Redis: `docker compose logs -f postgres redis`.
- Flutter: in-app System Status screen has a "diagnostic export" for support engineers (spec §60) — planned; tracked in `docs/architecture.md` §15 build status.
