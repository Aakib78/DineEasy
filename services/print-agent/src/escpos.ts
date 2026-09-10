/**
 * Pure ESC/POS ticket rendering — no network, no filesystem, no printer. Turns the
 * printer-agnostic `PrinterJob.payload` shapes the backend enqueues (see
 * `services/api/src/modules/orders/orders.service.ts` and `.../billing/billing.service.ts`
 * for exactly what's in those payloads — this file's input types mirror them by hand, the
 * same "hand-mirrored across a serialization boundary" tradeoff `packages/shared_types`
 * documents for the customer web app) into the raw byte sequence a network ESC/POS thermal
 * printer expects on the wire. Kept as pure functions returning a `Buffer` specifically so
 * this is testable without hardware, a fake TCP server, or the API running at all — see
 * `escpos.spec.ts`.
 *
 * v1 scope, deliberately: plain ASCII text only (bold + alignment + a full cut, no barcodes/
 * QR/logos/custom codepages). Money is rendered "Rs. <amount>" rather than "₹<amount>" — the
 * default ESC/POS codepage (PC437) most budget thermal printers ship with has no ₹ glyph, and
 * selecting a different codepage is printer-model-specific (`ESC t n`, with `n` meaning a
 * different table per vendor); ASCII-only output is guaranteed to render correctly on every
 * network ESC/POS printer without per-model configuration. Revisit once a specific printer
 * model needs to be supported and its codepage table is known.
 */

// ---------------------------------------------------------------------------
// Raw ESC/POS control sequences (Epson ESC/POS reference — the de facto standard nearly every
// budget thermal printer, Indian-market ones very much included, implements a subset of).
// ---------------------------------------------------------------------------

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]); // ESC @ — reset to defaults
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
/** Feed 4 lines then full cut — the feed keeps the cut below the printed content, not through it. */
const FEED_AND_CUT = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x00]);

/** Printable width in characters. 42 columns fits both common 58mm and 80mm thermal rolls
 * without truncation on the narrower one — a specific printer's real column count (governed by
 * its font + paper width) can be passed in once one is actually being integrated against. */
const DEFAULT_WIDTH = 42;

function line(text = ''): Buffer {
  return Buffer.concat([Buffer.from(text, 'ascii'), Buffer.from('\n', 'ascii')]);
}

function rule(width: number): Buffer {
  return line('-'.repeat(width));
}

/** Left-pads/truncates `text` to exactly `width` chars — keeps every ticket's columns aligned
 * regardless of how long an item name or amount happens to be. */
function fit(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

/**
 * Two-column line: `left` flush left, `right` flush right, at least one space between them.
 * If both together don't fit `width`, `left` is truncated first — the amount on the right
 * (a total, a quantity) is more important to keep intact and un-truncated than the label.
 */
export function twoColumn(left: string, right: string, width: number = DEFAULT_WIDTH): string {
  const maxLeft = Math.max(width - right.length - 1, 0);
  const truncatedLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const gap = width - truncatedLeft.length - right.length;
  return truncatedLeft + ' '.repeat(Math.max(gap, 1)) + right;
}

// ---------------------------------------------------------------------------
// KOT (kitchen order ticket) — mirrors the payload OrdersService.enqueueForType('KITCHEN', ...)
// builds in createOrder/addItems.
// ---------------------------------------------------------------------------

export interface KotTicketItem {
  name: string;
  quantity: number;
  notes?: string | null;
}

export interface KotTicketPayload {
  kotNumber: string;
  orderNumber: string;
  tableName?: string | null;
  isModification: boolean;
  items: KotTicketItem[];
}

export function buildKotTicket(
  payload: KotTicketPayload,
  width: number = DEFAULT_WIDTH,
  now: Date = new Date(),
): Buffer {
  const parts: Buffer[] = [INIT, ALIGN_CENTER, BOLD_ON];
  parts.push(line(payload.isModification ? 'KOT - ADDED ITEMS' : 'KITCHEN ORDER TICKET'));
  parts.push(BOLD_OFF, ALIGN_LEFT);
  parts.push(rule(width));
  parts.push(line(twoColumn(`KOT #${payload.kotNumber}`, `Order #${payload.orderNumber}`, width)));
  parts.push(line(`Table: ${payload.tableName ?? 'Takeaway / Delivery'}`));
  parts.push(rule(width));

  for (const item of payload.items) {
    parts.push(line(twoColumn(item.name, `x${item.quantity}`, width)));
    if (item.notes) parts.push(line(`  Note: ${item.notes}`));
  }

  parts.push(rule(width));
  parts.push(line(formatTimestamp(now)));
  parts.push(FEED_AND_CUT);

  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Receipt (guest bill) — mirrors the payload BillingService.generateInvoice's
// enqueueForType('RECEIPT', ...) call builds.
// ---------------------------------------------------------------------------

export interface ReceiptTicketItem {
  description: string;
  quantity: number;
  total: string;
}

export interface ReceiptTicketTax {
  taxType: string;
  ratePercent: string;
  taxAmount: string;
}

export interface ReceiptTicketPayload {
  invoiceNumber: string;
  orderNumber: string;
  items: ReceiptTicketItem[];
  subtotal: string;
  taxes: ReceiptTicketTax[];
  total: string;
  /** Restaurant identity for the ticket header (spec §16: a GST-compliant bill names the
   * business, not just the order). All optional and all independently omittable — a job
   * enqueued before this header existed (queued in the DB, not yet SENT when this agent build
   * rolled out) carries none of these fields, and `coerceReceiptPayload` below must render a
   * sane ticket without them rather than throwing on payload from before this field existed. */
  outletName?: string | null;
  /** Pre-composed single line — `BillingService` joins whichever of address/city/state/pincode
   * the outlet actually has set (all optional on `Outlet`) rather than this file guessing which
   * pieces are present. */
  outletAddress?: string | null;
  outletPhone?: string | null;
  gstin?: string | null;
  fssaiLicense?: string | null;
}

/** ESC/POS-safe money rendering — see the file doc comment for why this is "Rs." not "₹". */
function money(amount: string): string {
  return `Rs. ${amount}`;
}

export function buildReceiptTicket(
  payload: ReceiptTicketPayload,
  width: number = DEFAULT_WIDTH,
  now: Date = new Date(),
): Buffer {
  const parts: Buffer[] = [INIT, ALIGN_CENTER, BOLD_ON];
  // The outlet's own name is the ticket's real headline when it's known — falls back to the
  // generic "RECEIPT" title exactly as before for a payload with no outlet fields at all (an
  // older queued job, or this agent talking to an API version that predates this header).
  parts.push(line(payload.outletName || 'RECEIPT'));
  parts.push(BOLD_OFF);
  if (payload.outletAddress) parts.push(line(payload.outletAddress));
  if (payload.outletPhone) parts.push(line(`Ph: ${payload.outletPhone}`));
  const regLine = [
    payload.gstin ? `GSTIN: ${payload.gstin}` : null,
    payload.fssaiLicense ? `FSSAI: ${payload.fssaiLicense}` : null,
  ]
    .filter((v): v is string => v !== null)
    .join('  ');
  if (regLine) parts.push(line(regLine));
  parts.push(ALIGN_LEFT);
  parts.push(rule(width));
  parts.push(
    line(twoColumn(`Invoice #${payload.invoiceNumber}`, `Order #${payload.orderNumber}`, width)),
  );
  parts.push(rule(width));

  for (const item of payload.items) {
    parts.push(
      line(
        twoColumn(
          fit(`${item.description} x${item.quantity}`, width - 12),
          money(item.total),
          width,
        ),
      ),
    );
  }

  parts.push(rule(width));
  parts.push(line(twoColumn('Subtotal', money(payload.subtotal), width)));
  for (const tax of payload.taxes) {
    parts.push(
      line(twoColumn(`${tax.taxType} (${tax.ratePercent}%)`, money(tax.taxAmount), width)),
    );
  }
  parts.push(rule(width));
  parts.push(BOLD_ON);
  parts.push(line(twoColumn('TOTAL', money(payload.total), width)));
  parts.push(BOLD_OFF);
  parts.push(rule(width));
  parts.push(ALIGN_CENTER);
  parts.push(line('Thank you, visit again!'));
  parts.push(line(formatTimestamp(now)));
  parts.push(FEED_AND_CUT);

  return Buffer.concat(parts);
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `PrinterJob.payload` is an opaque `Json` column on the backend (see `PrinterJob` in
 * `prisma/schema.prisma`) — nothing about its shape is enforced at the database or DTO level
 * beyond `Record<string, unknown>`, by design (the API doesn't know or care what a print agent
 * needs — see docs/printing.md). So this agent, on the receiving end, has to validate the
 * shape itself before trusting it enough to build a ticket from it; a malformed or
 * unrecognized payload should fail the job loudly (reported back as FAILED with a clear
 * `lastError`) rather than crash the agent's poll loop or print garbage.
 */
export type PrinterJobKind = 'KOT' | 'RECEIPT';

export function renderJobPayload(payload: unknown): { kind: PrinterJobKind; ticket: Buffer } {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Print job payload is not an object');
  }
  const p = payload as Record<string, unknown>;

  if (typeof p.kotNumber === 'string' && Array.isArray(p.items)) {
    return { kind: 'KOT', ticket: buildKotTicket(coerceKotPayload(p)) };
  }
  if (typeof p.invoiceNumber === 'string' && Array.isArray(p.items)) {
    return { kind: 'RECEIPT', ticket: buildReceiptTicket(coerceReceiptPayload(p)) };
  }
  throw new Error(
    'Print job payload matches neither a KOT (kotNumber + items) nor a receipt (invoiceNumber + items) shape',
  );
}

function coerceKotPayload(p: Record<string, unknown>): KotTicketPayload {
  return {
    kotNumber: String(p.kotNumber),
    orderNumber: String(p.orderNumber ?? ''),
    tableName: typeof p.tableName === 'string' ? p.tableName : null,
    isModification: Boolean(p.isModification),
    items: (p.items as unknown[]).map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        name: String(item.name ?? ''),
        quantity: Number(item.quantity ?? 0),
        notes: typeof item.notes === 'string' ? item.notes : null,
      };
    }),
  };
}

function coerceReceiptPayload(p: Record<string, unknown>): ReceiptTicketPayload {
  return {
    invoiceNumber: String(p.invoiceNumber),
    orderNumber: String(p.orderNumber ?? ''),
    items: (p.items as unknown[]).map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        description: String(item.description ?? ''),
        quantity: Number(item.quantity ?? 0),
        total: String(item.total ?? '0'),
      };
    }),
    subtotal: String(p.subtotal ?? '0'),
    taxes: Array.isArray(p.taxes)
      ? (p.taxes as unknown[]).map((raw) => {
          const tax = raw as Record<string, unknown>;
          return {
            taxType: String(tax.taxType ?? ''),
            ratePercent: String(tax.ratePercent ?? '0'),
            taxAmount: String(tax.taxAmount ?? '0'),
          };
        })
      : [],
    total: String(p.total ?? '0'),
    // All optional — see the interface's doc comment on why a payload predating this header
    // must coerce cleanly with none of these present, not throw.
    outletName: typeof p.outletName === 'string' ? p.outletName : null,
    outletAddress: typeof p.outletAddress === 'string' ? p.outletAddress : null,
    outletPhone: typeof p.outletPhone === 'string' ? p.outletPhone : null,
    gstin: typeof p.gstin === 'string' ? p.gstin : null,
    fssaiLicense: typeof p.fssaiLicense === 'string' ? p.fssaiLicense : null,
  };
}
