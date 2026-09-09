/** Mirrors `PrintersController`/`PrintersService`'s response shapes
 * (`services/api/src/modules/printers`) and the `Printer`/`PrinterJob` Prisma models
 * (`schema.prisma`) — see `docs/printing.md` for the printing design this is part of: staff
 * apps only ever create/list `Printer` rows and read job history through this API, they never
 * talk to a physical printer directly. That's `services/print-agent`'s job, a separate LAN
 * process, not covered by this package. */

export type PrinterType = 'KITCHEN' | 'RECEIPT';

/** Both are real, working connection types — `services/print-agent` polls a `NETWORK` printer
 * over raw TCP (`ipAddress`/`port`, almost always 9100, the near-universal "raw 9100"
 * convention for network thermal printers) and a `USB` printer via the standard USB Printer
 * class (`src/printer-usb.ts`, vendor-independent — no Epson-specific driver needed). A `USB`
 * printer has no `ipAddress`/`port`; it must be physically connected to whichever machine runs
 * `services/print-agent`, not a client device — see `docs/printing.md`. */
export type PrinterConnectionType = 'NETWORK' | 'USB';

export interface Printer {
  id: string;
  outletId: string;
  stationId: string | null;
  name: string;
  type: PrinterType;
  connectionType: PrinterConnectionType;
  ipAddress: string | null;
  port: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `QUEUED` -> `SENT` (success) or `FAILED` is the whole lifecycle in practice — `ACKED` is a
 * reserved schema value nothing sets today (reserved for a future printer protocol that supports
 * delivery confirmation; see `docs/printing.md`). A job only becomes terminally `FAILED` after 3
 * send attempts (`PrintersService.updateJobStatus`'s retry logic) — a job that failed once and
 * got requeued shows back up as `QUEUED` with `attempts > 0` and `lastError` still populated, not
 * as `FAILED`, so "recently flaky" and "currently stuck" are both worth checking, not just the
 * `FAILED` count. */
export type PrinterJobStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'ACKED';

/** One row per print attempt, from `GET /printers/:id/jobs` (`PrintersService.listJobs`) — the
 * last 50 for one printer, newest first, no pagination/status filter on this endpoint today. See
 * `docs/printing.md`'s "Operator visibility" section for the health screen this backs.
 *
 * `payload` is untyped/opaque by design on the backend (`EnqueuePrintJobDto`'s doc comment) — a
 * `Record<string, unknown>` describing what was printed, shaped differently per job kind rather
 * than a fixed schema. There's no `orderId`/`invoiceId` FK on the job row itself, so `payload` is
 * the *only* place any order/invoice context lives. In practice (see `BillingService`'s
 * `buildReceiptPayload` and `OrdersService`'s KOT enqueue call) every payload carries
 * `orderNumber`, a RECEIPT payload also carries `invoiceNumber`, and a KITCHEN payload also
 * carries `kotNumber`/`tableName` — but none of that is guaranteed or validated, so read it
 * defensively (missing/differently-shaped fields should degrade gracefully, not throw). */
export interface PrinterJob {
  id: string;
  printerId: string;
  status: PrinterJobStatus;
  attempts: number;
  lastError: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
