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

### `docker compose up` / `docker pull` fails with `403 Forbidden` resolving `registry-1.docker.io`

A third member of the same restricted-egress family as the two entries above (this project was built in a sandbox that allowlists the npm/PyPI/crates/Go module registries but not Docker Hub) — the fix is the same: run it from a network that can actually reach Docker Hub. This is why the compose files in this repo were validated here with `docker compose config` (pure YAML/interpolation validation, no image pull) rather than a real `docker compose up`, using a natively `apt`-installed Postgres 16 + Redis instead (both packages *were* reachable via the Ubuntu archive mirrors in that sandbox) to re-confirm the migration and app config independently — see `docs/architecture.md` §15 for exactly what that did and didn't prove. If your network can reach Docker Hub, a plain `docker compose up` should just work; if you hit this specific error, the compose files are not the problem.

### Fixed in this repo: `docker compose up`/`config` used to fail outright

Three real bugs were caught the first time these compose files were actually exercised (previously only read, never run — see the git history around the LAN/offline-validation slice):

1. `infrastructure/docker/docker-compose.yml` had a stray literal `\` as its very first byte (predates a `#` comment on the same intended line), which is invalid YAML — `docker compose` refused to parse the file at all, for every command, unconditionally. Fixed by deleting the stray character.
2. Running `docker compose` from the repo root with `-f infrastructure/docker/...` does **not** auto-load the root `.env` the way you'd expect — Compose's default project directory (and therefore its default `.env` lookup) follows the directory of the *first* `-f` file, not your current directory, once you pass explicit `-f` flags. `npm run docker:up`/`docker:down`/`docker:prod` now pass `--env-file .env` explicitly rather than relying on the auto-load. If you're running `docker compose` by hand from the repo root instead of via the npm scripts, do the same (`docker compose --env-file .env -f ...`) or you'll hit `POSTGRES_PASSWORD is required` even with a perfectly good `.env` sitting right there.
3. `docker-compose.test.yml` overriding `POSTGRES_PASSWORD` with a literal value didn't actually satisfy the base file's `${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}` guard — Compose interpolates each file's own variables before merging overlays, so a later file's literal override can't retroactively satisfy an earlier file's required-variable check. `npm run docker:test` now exports `POSTGRES_PASSWORD` directly in the command itself so the base file's interpolation always has something to see.

All three combinations (`docker-compose.yml` alone, `+dev`, `+test`) were re-validated with `docker compose config --quiet` after the fixes (exit code 0, and for the `web` service specifically, confirmed `VITE_API_BASE_URL` actually resolves as a build arg — see the next section).

A fourth issue, found while adding `apps/customer_web/Dockerfile` (it didn't exist until the customer PWA was built — see `docs/customer-web.md` — even though the base compose file already referenced it): the `web` service was setting a container-runtime `environment: VITE_API_URL: ...` entry, which is wrong two ways at once — the app actually reads `VITE_API_BASE_URL` (not `VITE_API_URL`), and Vite bakes `VITE_`-prefixed env vars into the bundle at *build* time, so a runtime `environment:` entry on a pre-built static nginx image does nothing regardless of its name. Fixed by passing it as a `build.args` entry instead (`docker-compose.yml`) and, for the dev target where Vite's own dev server does read runtime env vars, as `environment:` on that override only (`docker-compose.dev.yml`).

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
