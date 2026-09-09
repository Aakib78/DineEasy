# Printing

## Why printing is a queue, not a direct call

Restaurant printers (kitchen dot-matrix/thermal, receipt thermal) are flaky, sometimes offline, sometimes out of paper — and a KOT/bill must never be *lost* just because a printer hiccuped at the wrong moment (spec §43: "printer unavailable" is an explicit failure case to handle gracefully). So `KitchenModule`/`BillingModule` never talk to a printer directly; they enqueue a `PrinterJob` (`payload` is a structured, printer-agnostic description of what to print — order/table/items for a KOT, or the full invoice for a receipt) and move on. A separate process — `services/print-agent`, see below — drains the queue.

```
KOT/Invoice created
        │
        ▼
  PrinterJob (status: QUEUED)
        │
        ▼
  Print agent picks it up
        │
   ┌────┴────┐
   ▼         ▼
 SENT      FAILED (retry with backoff, surface to Settings → Printers after N attempts)
   │
   ▼
 ACKED (if the printer protocol supports delivery confirmation; otherwise SENT is terminal)
```

## v1 scope: what's actually implemented vs. planned

**Implemented** (`PrintersModule` — `printers.service.ts`/`printers.controller.ts`): `Printer` CRUD (station-scoped for kitchen, outlet-scoped for receipt) with `connectionType: NETWORK | USB` and, for network printers, `ipAddress`/`port`; the `PrinterJob` queue itself (`QUEUED → SENT/FAILED → ACKED`, with automatic re-queue up to 3 attempts on failure); `GET /printers/:id/jobs/next` for a print agent to poll and `PATCH /printers/jobs/:jobId/status` for it to report back; and the two call sites that actually enqueue real jobs — `OrdersService` enqueues a `KITCHEN` job to every active kitchen printer at the outlet right after each KOT is created (initial placement and every `addItems` modification), and `BillingService` enqueues a `RECEIPT` job right after an invoice is generated. Both enqueue calls are best-effort and fail open — same philosophy as `RedisService` — so an outlet with no printer configured, or a transient DB hiccup enqueuing the job, never blocks placing an order or generating a bill.

`BillingService.generateInvoice` is idempotent and deliberately does **not** re-print on a repeat call (see its doc comment) — the automatic RECEIPT job fires exactly once, at the moment an invoice is first created. `POST /invoices/:id/print` (`BillingController.print` → `BillingService.printInvoice`, gated on `billing.view` since it doesn't change anything financial) is the explicit escape hatch for everything that automatic single print can't cover: the printer was off/out of paper at that moment, or the customer just wants a second copy. Both client apps' billing detail screens now surface this as a "Print bill" button next to the invoice once it exists (`apps/pos_web/src/features/billing/BillingDetailScreen.tsx`, `apps/restaurant_app/lib/features/billing/billing_detail_screen.dart`) — safe to press more than once, each press just queues one more `RECEIPT` job through the same `enqueueForType` path.

**Implemented — the print agent** (`services/print-agent`, a separate small standalone Node/
TypeScript process, not a NestJS module — see its own README.md for the full design): polls
`nextQueuedJob`/reports via `updateJobStatus` for every configured, active printer, renders the
job's payload into ESC/POS bytes (`escpos.ts` — identical bytes regardless of transport), and
delivers them one of two ways depending on the printer's `connectionType`:

- **`NETWORK`** (`printer-socket.ts`): a raw TCP connection to `ipAddress:port` (almost always
  9100, the dominant convention for network thermal printers, and the target this was always
  scoped to — Indian QSRs/cafés overwhelmingly use this class of printer).
- **`USB`** (`printer-usb.ts`, using the `usb`/libusb npm package): finds the first connected
  device exposing a standard USB Printer-class (0x07) interface — vendor-independent, no
  Epson-specific driver needed — claims it, and writes the ticket to its bulk OUT endpoint. No
  device-identifying field is required on the `Printer` row for this in v1 (see that file's doc
  comment for the reasoning and its `match` escape hatch for a machine with more than one USB
  printer). Requires the printer to be physically connected to whichever machine runs the agent
  — never a phone or tablet, which can't drive USB hardware for a client app to begin with.

See `services/print-agent/README.md`'s "Verification status" for exactly how the `NETWORK`
path was verified without physical printer hardware (a real local TCP server standing in for
the printer, a real local HTTP server standing in for `services/api`, plus an actual
end-to-end run of the compiled agent against both); the `USB` path is unit-tested against a
mocked `usb` module (no real USB hardware exists in that verification environment either) — see
`printer-usb.spec.ts`'s doc comment for why that's the right substitute where TCP/HTTP could use
a real local stand-in instead. `docs/architecture.md` §15 has the authoritative "done vs.
planned" list.

## Why this stays out of the domain layer

`OrdersService` and `BillingService` have zero knowledge of ESC/POS, printer IPs, USB, or retry logic — they only know how to enqueue a `PrinterJob` via `PrintersService.enqueueForType()`. This means: a restaurant with no printers configured yet still gets working KOT/billing (the queue just accumulates unconsumed jobs, harmlessly); adding USB support to the print agent (done — see above) touched only that new component, never order/billing/kitchen logic, and the same is true for a future cloud print service or a different receipt format; and a printer being offline for an hour never blocks taking new orders.

## Operator visibility

**Implemented**: `apps/pos_web/src/features/printers/PrintersScreen.tsx` (`printers.manage`-gated, so Owner/Manager only — nav tab hidden for everyone else, same pattern as every other permission-gated destination) lists an outlet's printers and lets you register a new one (name, `KITCHEN`/`RECEIPT`, `NETWORK`/`USB`, IP/port for network) — this is what closes the loop `services/print-agent/README.md` always assumed existed ("create a printer via Settings → Printers, or `POST /printers`") but that no app actually had until this screen. The Flutter app has no equivalent yet — its own Settings destination is still a placeholder (`home_shell.dart`).

**Still planned, not built**: per-printer job history, current queue depth, and recent-failure surfacing — the "printer status" the system health screen is meant to show (spec §59/§60). Today, confirming a `PrinterJob` actually sent or failed means querying it directly (`GET /printers/:id/jobs`) or watching `services/print-agent`'s own logs; there's no UI for it yet.
