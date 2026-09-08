# LAN deployment guide

DineEasy's server is designed to run on a single machine inside the restaurant — a small fanless PC, a back-office desktop, or a NUC — connected to the restaurant's router. This document covers that deployment; see `docs/offline-mode.md` for the architectural reasoning.

## Requirements

- A machine that can stay powered on during business hours, with Docker installed (Docker Desktop on Windows/Mac, or Docker Engine on Linux). 4GB+ RAM, any modern CPU — this is not resource-intensive for a single-outlet restaurant's order volume.
- A static (or DHCP-reserved) LAN IP for that machine, so staff devices and the QR menu resolve to a stable address.
- The restaurant's router configured so that:
  - **Staff Wi-Fi** and **guest Wi-Fi** are both able to reach the server machine's LAN IP on the API port (default `3000`) and web port (default `8080`). If the router puts guest Wi-Fi on an isolated VLAN/subnet (common on many consumer routers' "guest network" feature), it must still route to the server subnet — a fully isolated guest network will not be able to load the QR menu (see `docs/troubleshooting.md`).
  - Client/AP isolation on guest Wi-Fi (if enabled) must NOT block guest devices from reaching the server's IP specifically — most routers let you add a subnet/host exception. If your router can't do that, put guest and staff on the same flat network instead.
- Internet connectivity is **optional** — required only for online payment provider calls and any future cloud sync, never for POS/orders/KOT/KDS/billing/local QR/local reports.

## Steps

```bash
git clone git@github.com-personal:Aakib78/DineEasy.git
cd DineEasy
cp .env.example .env
# edit .env: set strong POSTGRES_PASSWORD, JWT secrets, QR_TOKEN_SECRET (never reuse dev values)
npm run docker:prod    # docker compose -f infrastructure/docker/docker-compose.yml up -d
```

This builds and starts `postgres`, `redis`, `api`, and `web` as long-running containers (`restart: unless-stopped`), so they come back up automatically after a power cycle or Docker restart.

Run migrations once against the fresh database:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec api npm run prisma:migrate
```

Point staff devices at `http://<server-lan-ip>:3000` (or use LAN discovery once configured, `docs/offline-mode.md` §Local network discovery) and print/place table QR codes pointing at `http://<server-lan-ip>:8080/q/<token>`.

## Backups

`dineeasy_postgres_data` is a named Docker volume. Back it up like any Postgres instance, e.g. nightly `pg_dump` to an external drive or (future, per spec §47) DineEasy Cloud backup. This is on the restaurant's LAN, not automatically backed up by DineEasy today — call this out explicitly to the restaurant owner during setup.

## Updating

```bash
git pull
npm run docker:prod -- --build   # rebuild images with the new code
docker compose -f infrastructure/docker/docker-compose.yml exec api npm run prisma:migrate
```

Version compatibility between the Flutter app and the API is checked via `/api/v1/system/version` — see `docs/architecture.md` §12 and §61.
