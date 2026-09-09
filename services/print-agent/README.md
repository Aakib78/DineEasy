# Print agent (`services/print-agent`)

## What this is

The LAN-side half of DineEasy's printing design (spec §13, `docs/printing.md`): `services/api`
never talks to a printer directly, it only enqueues a `PrinterJob` (KOT or receipt) onto a
queue. This is the small standalone process that actually drains that queue — it polls
`GET /printers/:id/jobs/next` for each configured, active printer, renders the job's payload
into ESC/POS bytes, delivers them to the printer (a raw TCP connection to port 9100 for a
`NETWORK` printer, or a USB bulk transfer for a `USB` one — see "What's built" below), and
reports the outcome back with `PATCH /printers/jobs/:jobId/status`.

It's a separate package, not a NestJS module inside `services/api`, on purpose: it needs to run
*on the restaurant's LAN*, with network access to the printers, which is not necessarily the
same machine or network reachability as wherever the API itself is deployed (see
`docs/deployment.md`). In the common case — the API running on a small on-site machine, per
`docs/offline-mode.md`'s LAN-first design — this agent runs on that same machine, but nothing
about it assumes that.

## What's built

- **ESC/POS rendering** (`src/escpos.ts`): pure functions turning the two payload shapes
  `OrdersService`/`BillingService` actually enqueue (`{kotNumber, items, ...}` for a KOT,
  `{invoiceNumber, items, taxes, ...}` for a receipt — see those services' `enqueueForType`
  calls) into raw printer bytes: init, centered/bold header, aligned two-column item lines, a
  rule, and a full paper cut. v1 is plain ASCII only (see the file's doc comment for why money
  is rendered "Rs. 450.00" rather than "₹450.00" — the default ESC/POS codepage most budget
  printers ship with has no ₹ glyph).
- **Payload validation** (`renderJobPayload`): `PrinterJob.payload` is an opaque `Json` column
  on the backend by design — nothing enforces its shape before it reaches this agent — so this
  is where a malformed or unrecognized payload gets caught and reported `FAILED` with a clear
  reason, instead of crashing the poll loop or sending garbage to a printer.
- **Raw TCP delivery** (`src/printer-socket.ts`): connects to `ipAddress:port`, writes the
  ticket, resolves on the OS accepting the write (most budget ESC/POS printers give no
  higher-level acknowledgment over this transport — see the file's doc comment), with a
  configurable timeout so an offline printer can't hang the poll loop indefinitely.
- **USB delivery** (`src/printer-usb.ts`, via the `usb` npm package — libusb bindings with
  prebuilt native binaries, no local C++ toolchain needed): finds the first connected device
  that exposes a standard USB Printer-class (0x07) interface — vendor-independent, works with
  any ESC/POS USB printer including Epson's, not just a specific vendor/product ID — claims it,
  and writes the ticket to its bulk OUT endpoint. Re-discovers and re-opens the device on every
  send rather than holding a persistent handle, since a USB printer gets unplugged/power-cycled
  by staff far more often than a network one drops off; see the file's doc comment. Takes an
  optional `vendorId`/`productId` match for the (currently unusual) case of more than one USB
  printer on the same machine — see "USB with more than one printer" below.
- **API client with token refresh** (`src/api-client.ts`): logs in once with a staff account's
  email/password, and transparently refreshes on a 401 (the access token's normal 15-minute
  expiry, given this is meant to run for hours/days unattended) and retries the one request
  that triggered it.
- **Poll loop** (`src/poll-loop.ts`): per active printer — `NETWORK` needs an `ipAddress`/`port`
  set, `USB` needs nothing else (discovery happens at send time) — poll for a job, render it,
  send it over whichever transport that printer's `connectionType` calls for, report
  `SENT`/`FAILED`. One printer's failure (job fetch, render, send, or status report) never stops
  the others from being polled.

## What's explicitly not built

Delivery confirmation beyond the write succeeding (`ACKED` is a defined `PrinterJobStatus` but
this agent never reaches it — most ESC/POS printers, network or USB, don't report back over
either transport), barcode/QR/logo printing, non-ASCII/regional-script receipts, and any retry
logic of its own — retries are entirely the backend's job (`PrintersService` re-queues a
`FAILED` job up to 3 attempts; this agent reports once per attempt and moves on).

## Setting it up

Steps 2–3 are identical either way; step 1 branches on how the printer is actually connected.

1. **Create a printer in DineEasy** — `apps/pos_web`'s Printers screen (nav tab visible to an
   Owner/Manager login, at `/printers`), or `POST /printers` directly.

   - **Network** (`connectionType: NETWORK`): give the printer a static IP first (most ESC/POS
     printers print their current IP from a self-test button combo, or ship a config utility
     like Epson's EpsonNet Config/TM-Utility) — a DHCP lease that changes later silently breaks
     printing until this row is updated to match. Register it with that `ipAddress` and `port`
     (usually `9100`).
   - **USB** (`connectionType: USB`): plug the printer into the same machine that will run this
     agent (see step 3) — not a phone or tablet, which can't drive USB printer hardware for a
     client app to begin with. Register it with no `ipAddress`/`port`; the agent auto-discovers
     the connected printer by its USB device class, not by IP. See "USB with more than one
     printer" below if this machine has more than one USB printer attached.

2. **Create a staff account for the agent** — a normal user via the Staff screen, given a role
   that holds only `printers.manage`, scoped to the one outlet it should serve (an org-wide/
   multi-outlet account has no single "active outlet" for the agent to act on — see
   `requireActiveOutlet` on the backend — so this must be a single-outlet role assignment).
3. **Configure and run the agent** on a machine with LAN access to a network printer, or the
   physical USB connection to a USB one (in the common single-machine deployment, the same
   machine as the API):

   ```bash
   cd services/print-agent
   npm install        # from the repo root, so it resolves as an npm workspace
   cp .env.example .env
   # edit .env: PRINT_AGENT_API_BASE_URL, PRINT_AGENT_EMAIL/PASSWORD from step 2
   npm run build
   npm start           # or `npm run dev` for ts-node without a build step
   ```

   `usb` (the USB delivery dependency) ships prebuilt native binaries (via `prebuildify`) for
   the common platforms, so `npm install` alone should be enough — no Xcode command line tools
   or `node-gyp` build step expected on a normal macOS/Windows/Linux machine.

   Run it as a background service (systemd unit, pm2, Windows service, launchd on macOS) the
   same way any other always-on LAN process on the restaurant's server would be run — that
   packaging is left to the deployment target, not opinionated here.

## USB with more than one printer

`printer-usb.ts`'s auto-discovery picks the *first* connected USB Printer-class device it
finds — fine for the common one-printer-per-machine case, ambiguous with two. If a machine ever
has more than one USB printer, find each one's vendor/product ID (`system_profiler SPUSBDataType`
on macOS, `lsusb` on Linux, Device Manager on Windows — look for something like
`ID 04b8:0202`, where `04b8` is Epson's vendor ID) and pass `match: { vendorId, productId }` to
`sendToUsbPrinter` for that printer in `src/index.ts`'s wiring. There's no UI for this yet — the
`Printer` row itself has no vendor/product ID field (see `docs/printing.md`'s USB section for
why v1 doesn't require one) — so today this means a small code change per machine that needs it,
not a setup-screen option.

## Troubleshooting USB

- **"No USB printer found" but it's definitely plugged in**: on macOS, check whether the
  printer was set up as a regular AirPrint/CUPS printer (System Settings → Printers & Scanners)
  — a driver that's already claimed the device can make it invisible to this agent's direct USB
  access. Removing it from there (this agent doesn't need it added as a system printer at all)
  usually frees it up.
- **A permissions/access error on `device.open()`**: usually resolved by not having another
  process (a vendor driver, CUPS) holding the device — see above — rather than a real OS
  permission you need to grant; unlike some USB device classes, plain USB Printer-class access
  doesn't typically need special OS entitlements on macOS or Windows.
- **It worked once, then stopped after the printer was unplugged/replugged**: expected and
  harmless — the next poll cycle re-discovers the device from scratch (see `printer-usb.ts`'s
  doc comment on why it never holds a persistent handle), so this should self-heal within one
  `PRINT_AGENT_POLL_INTERVAL_MS`.

## Running it

See "Setting it up" above; `npm test` runs the unit tests (below) with no live API or printer
required.

## Verification status

Fully unit-tested in this environment, at three different levels of fidelity depending on what
each piece actually needs to prove:

- **`escpos.spec.ts`** — pure function tests: given a payload, the exact expected bytes (init
  sequence, full-cut trailer, every item/amount rendered as ASCII text) come out.
- **`printer-socket.spec.ts`** — a *real* local TCP server (Node's own `net` module, bound to
  `127.0.0.1`) stands in for a printer, and the test asserts the exact bytes it received match
  what was sent, plus a real `ECONNREFUSED` rejection against a closed port. The one thing this
  doesn't cover is the connect-timeout path, because reliably forcing a hung TCP handshake
  (rather than an instant accept/refuse) isn't something this sandboxed environment can
  manufacture deterministically — `socket.setTimeout` itself is well-established Node
  functionality, not reimplemented here.
- **`api-client.spec.ts`** — a real local HTTP server (Node's `http` module) plays
  `services/api`'s three relevant endpoints, including the 401 → refresh → retry sequence: the
  fake server only accepts the *new* token after `/auth/refresh` was actually called with the
  right refresh token, so the test passing is proof the refresh logic ran, not a lucky first
  try.
- **`poll-loop.spec.ts`** — the orchestration logic (which printers get polled, what happens on
  a malformed payload / a send failure / a status-report failure, that one printer's failure
  doesn't block the others) tested against fully in-memory fakes for the client and the
  sender, since the real behavior of those two pieces is already proven by the two files above.

What's **not** verified: an actual physical ESC/POS printer (no hardware in this sandbox), and
a real end-to-end run against a live `services/api` (blocked on `prisma generate` — see
`docs/troubleshooting.md`). The wire protocol (raw TCP to 9100, ESC/POS byte sequences) and the
HTTP contract (request/response shapes, auth flow) are both exercised for real against
faithful local stand-ins, which is the strongest verification available without either of
those two things.
