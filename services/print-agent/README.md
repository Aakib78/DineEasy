# Print agent (`services/print-agent`)

## What this is

The LAN-side half of DineEasy's printing design (spec §13, `docs/printing.md`): `services/api`
never talks to a printer directly, it only enqueues a `PrinterJob` (KOT or receipt) onto a
queue. This is the small standalone process that actually drains that queue — it polls
`GET /printers/:id/jobs/next` for each configured network printer, renders the job's payload
into ESC/POS bytes, opens a raw TCP connection to the printer (port 9100, the near-universal
"raw 9100" convention for network thermal printers), and reports the outcome back with
`PATCH /printers/jobs/:jobId/status`.

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
- **API client with token refresh** (`src/api-client.ts`): logs in once with a staff account's
  email/password, and transparently refreshes on a 401 (the access token's normal 15-minute
  expiry, given this is meant to run for hours/days unattended) and retries the one request
  that triggered it.
- **Poll loop** (`src/poll-loop.ts`): per active `NETWORK` printer with an `ipAddress`/`port`
  set, poll for a job, render it, send it, report `SENT`/`FAILED`. One printer's failure (job
  fetch, render, send, or status report) never stops the others from being polled. A `USB`
  printer is intentionally skipped — see docs/printing.md: USB is modeled in the schema for
  forward-compatibility only, no driver is planned for v1.

## What's explicitly not built

Delivery confirmation beyond the TCP write succeeding (`ACKED` is a defined `PrinterJobStatus`
but this agent never reaches it — most network ESC/POS printers don't report back over raw
9100), USB printer support, barcode/QR/logo printing, non-ASCII/regional-script receipts, and
any retry logic of its own — retries are entirely the backend's job (`PrintersService`
re-queues a `FAILED` job up to 3 attempts; this agent reports once per attempt and moves on).

## Setting it up

1. **Create a printer in DineEasy** (Settings → Printers, or `POST /printers`) with
   `connectionType: NETWORK` and the printer's LAN `ipAddress`/`port` (usually `9100`).
2. **Create a staff account for the agent** — a normal user via the Staff screen, given a role
   that holds only `printers.manage`, scoped to the one outlet it should serve (an org-wide/
   multi-outlet account has no single "active outlet" for the agent to act on — see
   `requireActiveOutlet` on the backend — so this must be a single-outlet role assignment).
3. **Configure and run the agent** on a machine with LAN access to the printer (in the common
   single-machine deployment, the same machine as the API):

   ```bash
   cd services/print-agent
   npm install        # from the repo root, so it resolves as an npm workspace
   cp .env.example .env
   # edit .env: PRINT_AGENT_API_BASE_URL, PRINT_AGENT_EMAIL/PASSWORD from step 2
   npm run build
   npm start           # or `npm run dev` for ts-node without a build step
   ```

   Run it as a background service (systemd unit, pm2, Windows service) the same way any other
   always-on LAN process on the restaurant's server would be run — that packaging is left to
   the deployment target, not opinionated here.

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
