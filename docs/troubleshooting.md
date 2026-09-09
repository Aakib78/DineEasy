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

### Fixed in this repo: `prisma migrate dev`/`seed` couldn't find `DATABASE_URL`, and a real seed bug, both caught on the first real run against a live network

Two more real bugs, both invisible in this sandbox for the same reason as the ones above — this was the first time any of `prisma migrate dev`, `prisma generate` running against a real database, or the seed script had ever actually executed past the `binaries.prisma.sh` restriction (`docs/architecture.md` §15). Running them for real (on a normal machine, per the fix above) surfaced both immediately:

1. `services/api`'s `prisma migrate dev`/`prisma:studio`/`seed` scripts failed with `Environment variable not found: DATABASE_URL`, even with a perfectly good root `.env` in place. Cause: every `npm run --workspace services/api <script>` (and `npm run dev:api`) runs with `services/api` as the process's working directory, not the repo root — and both Prisma CLI's own `.env` auto-loading and `@nestjs/config`'s default `envFilePath` resolve relative to that cwd, so neither ever looked at the root `.env` in the first place; this failed silently up front (no error about *finding* it, just about the variable inside it never existing). Fixed two ways, matching where each reader actually runs: `AppModule`'s `ConfigModule.forRoot` now passes `envFilePath: ['.env', '../../.env']` (covers the running app, `npm run dev:api`/`start`), and the `prisma:*`/`seed` scripts in `services/api/package.json` now go through `dotenv-cli` (`dotenv -e ../../.env -- prisma migrate dev`, etc. — covers the Prisma CLI and `ts-node prisma/seed.ts`, neither of which goes through Nest's `ConfigModule` at all). The root `.env` stays the single source of truth either way; nothing needs copying into `services/api/`.
2. `prisma/seed.ts` failed to compile: `prisma.userRole.upsert({ where: { userId_roleId_outletId: { ..., outletId } }, ... })` where `outletId` is `string | null` (org-wide roles, e.g. Owner, are seeded with `outletId: null`) — TS2322, `outletId` can't be `null` in that position. This isn't a seed-script-only quirk: `UserRole`'s `@@unique([userId, roleId, outletId])` includes a nullable column (`outletId String?`), and Prisma's generated compound-key `WhereUniqueInput` never accepts `null` for a nullable member of a unique index, because SQL's `NULL <> NULL` means an equality lookup there can't reliably mean "the row where this is NULL" the way `upsert`/`findUnique` require. `UsersService.removeRoleAssignment` already works around the identical shape with a plain (non-compound-key) `where` filter instead; `seed.ts` now does the same — `findFirst` + a manual `create` instead of `upsert` on the compound key. Both fixes were verified by an actual `tsc`/`ts-node` run against a *real* generated `@prisma/client` (on a machine that could reach `binaries.prisma.sh`) — the first time anything in this repo touching the generated client had been checked against the real thing rather than read for plausibility.

**Confirmed working end-to-end** after both fixes above plus the Docker port-conflict note below: `prisma:generate`, `prisma:migrate:dev`, and `seed` all completed successfully against a real dockerized Postgres on a developer's Mac — the first successful live run of this project's database layer since the schema was written. The demo accounts from `docs/local-development.md` §8 are now real, queryable rows.

### Fixed in this repo: `npm run docker:up` failed building the `web` image with `404 Not Found - @dineeasy/shared-types`

Another bug caught the first time these images were actually built (Docker Hub is blocked in the sandbox this repo was scaffolded in, so only `docker compose config` — pure YAML validation, no build — had ever been run against these compose files before now; see the `registry-1.docker.io` entry above). Symptom:

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@dineeasy%2fshared-types - Not found
npm error 404  '@dineeasy/shared-types@*' is not in this registry.
```

Cause: `apps/customer_web` depends on `packages/shared_types` (`@dineeasy/shared-types`, version `"*"`) as a local npm workspace package — it's never been published anywhere, and never should be. `apps/customer_web/Dockerfile`'s build context was `apps/customer_web` itself (`context: ../../apps/customer_web` in `docker-compose.yml`), so `packages/shared_types` was completely outside what Docker could see; `npm install` fell through to looking for it on the real npm registry and 404'd. `services/api`'s image never hit this because `services/api` doesn't currently depend on `packages/shared_types`.

Fixed by moving the `web` image's build context to the monorepo root (`context: ../..`, `dockerfile: apps/customer_web/Dockerfile`) so the whole workspace — root `package.json`/`package-lock.json` plus every workspace member's `package.json` — is visible to `npm install`, which is what lets npm link `@dineeasy/shared-types` from `packages/shared_types` instead of hitting the registry. Added a root `.dockerignore` (there wasn't one — only `services/api/.dockerignore`, scoped to that image's own context) so the larger root build context doesn't ship `node_modules`/`.git`/build output to the Docker daemon. `docker-compose.dev.yml`'s `web` bind mount changed from `../../apps/customer_web:/app` to `../..:/repo` (matching the Dockerfile's new `/repo` root, with `/repo/node_modules` and `/repo/apps/customer_web/node_modules` as anonymous volumes protecting the image's Linux-built `node_modules` from the host's) — this also means editing `packages/shared_types` now hot-reloads the dev container, which it couldn't before.

Both compose files re-validated with `docker compose config --quiet` after the fix (exit 0) — this sandbox still can't do a real `docker build` (same Docker Hub block), so the actual image build was verified on a real machine, not here.

If you only need Postgres + Redis (the normal day-to-day setup — see the top of `docs/local-development.md`), skip the full `docker:up` build entirely and start just those two services:

```
docker compose --env-file .env -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis
```

### `docker compose up postgres redis` fails with `address already in use` on port 5432, even though nothing shows up in `lsof`

Seen in practice on macOS with Docker Desktop after an earlier `docker compose up` attempt got interrupted partway (for example, the `web` image build failing per the entry above, or Docker Desktop being restarted mid-`up`) and left a container behind in `Created` state (`docker ps -a` shows it, but never `Up`). Removing that container (`docker rm <name>`) and retrying can still fail with the same port error — Docker Desktop's own internal port-forwarding layer (inside its VM, not your host OS) can hold a stale reservation that a plain container removal doesn't clear, which is also why the host's `lsof -iTCP:5432` shows nothing: the conflict isn't visible at the macOS network level at all.

Fixes, in order of effort:
1. Quit and reopen Docker Desktop entirely (not just restart a container) — this resets its internal VM networking state and is usually sufficient.
2. If you'd rather not restart Docker Desktop, change `POSTGRES_PORT` (and the port in `DATABASE_URL`) in `.env` to an unused port (e.g. `5433`) and bring the stack up again — sidesteps the conflict instead of resolving it, but unblocks local development immediately.

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
