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

export type PrinterJobStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'ACKED';

export interface PrinterJob {
  id: string;
  printerId: string;
  status: PrinterJobStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
