/** Typed wrappers over `apiRequest` for every staff endpoint this app calls — mirrors the
 * split `apps/restaurant_app/lib/features/pos/data/*_repository.dart` uses, collapsed into one
 * module here since this app is a single web bundle rather than several Dart libraries. */
import { apiRequest } from './client';
import type {
  Floor,
  RestaurantTable,
  TableQrCode,
  MenuCategory,
  Order,
  Invoice,
  PaymentMethod,
  PaymentSummary,
  Refund,
  DiscountType,
  Printer,
  PrinterType,
  PrinterConnectionType,
  PrinterJob,
} from '@dineeasy/shared-types';
import type { PosCartLine } from '../cart/pos-cart-types';

function toOrderItemJson(line: PosCartLine) {
  return {
    menuItemId: line.menuItemId,
    ...(line.variantId ? { menuItemVariantId: line.variantId } : {}),
    quantity: line.quantity,
    ...(line.notes ? { notes: line.notes } : {}),
    modifiers: line.modifierIds.map((modifierId) => ({ modifierId })),
  };
}

export const tablesApi = {
  listFloors: () => apiRequest<Floor[]>('/floors'),
  listTables: () => apiRequest<RestaurantTable[]>('/tables'),
  regenerateQrCode: (tableId: string) =>
    apiRequest<TableQrCode>(`/tables/${tableId}/qr/regenerate`, { method: 'POST' }),
};

export const menuApi = {
  /** `GET /menu` — the staff full tree (includes unavailable/inactive items, unlike the QR
   * guest tree — see MenuService.getFullTree on the backend). */
  getFullTree: () => apiRequest<MenuCategory[]>('/menu'),
};

export const ordersApi = {
  listActive: () => apiRequest<Order[]>('/orders'),
  // COMPLETED orders for one calendar day — see OrdersService.listCompletedForOutlet's doc
  // comment for why this exists: it's what makes a "Print bill" reprint reachable again after a
  // cashier navigates away from an order post-payment, once it's dropped off the active board.
  // `date` is "YYYY-MM-DD"; omitted defaults to today server-side.
  listCompleted: (date?: string) =>
    apiRequest<Order[]>(`/orders/completed${date ? `?date=${date}` : ''}`),
  getById: (orderId: string) => apiRequest<Order>(`/orders/${orderId}`),

  createOrder: (params: {
    type: 'DINE_IN' | 'TAKEAWAY';
    tableId?: string;
    items: PosCartLine[];
    notes?: string;
  }) =>
    apiRequest<Order>('/orders', {
      method: 'POST',
      body: {
        source: 'POS',
        type: params.type,
        ...(params.tableId ? { tableId: params.tableId } : {}),
        ...(params.notes ? { notes: params.notes } : {}),
        items: params.items.map(toOrderItemJson),
      },
    }),

  addItems: (orderId: string, items: PosCartLine[]) =>
    apiRequest<Order>(`/orders/${orderId}/items`, {
      method: 'POST',
      body: { items: items.map(toOrderItemJson) },
    }),

  /** PLACED -> ACCEPTED — front-of-house acknowledgment that a newly placed order (staff- or
   * QR-guest-sourced) has been seen and is legitimate. Distinct from the kitchen actually
   * starting it: `KitchenService.advanceOrderTo` auto-walks a still-PLACED order through
   * ACCEPTED the moment any of its kitchen items leaves NEW, so calling this explicitly only
   * matters for an order nobody's started cooking yet — see `OrdersService.acceptOrder`'s doc
   * comment on the backend. `orders.update`-gated, same as `serve` below. */
  accept: (orderId: string) => apiRequest<Order>(`/orders/${orderId}/accept`, { method: 'POST' }),

  /** READY -> SERVED — see OrderScreen's doc comment on why this is its own explicit action. */
  serve: (orderId: string) => apiRequest<Order>(`/orders/${orderId}/serve`, { method: 'POST' }),

  /** `orders.cancel`-gated (Owner/Manager only — Waiter/Cashier can build and update an order
   * but not void one). Blocked once the order is BILLED+settled (bill already reflects the
   * item) — see `OrdersService.cancelItem`'s doc comment for why that's a stricter cutoff than
   * `cancel` below. Returns the full, re-fetched order. */
  cancelItem: (orderId: string, itemId: string) =>
    apiRequest<Order>(`/orders/${orderId}/items/${itemId}/cancel`, { method: 'POST' }),

  /** `orders.cancel`-gated. Legal from any pre-payment status (see the state machine in
   * `order-state-machine.ts` — CANCELLED is reachable from everything except PAID/COMPLETED,
   * which can only be REFUNDED once money has moved); the backend 400s otherwise. `reason` is
   * optional and only for the audit trail — nothing downstream requires it. */
  cancel: (orderId: string, reason?: string) =>
    apiRequest<Order>(`/orders/${orderId}/cancel`, {
      method: 'POST',
      body: reason ? { reason } : {},
    }),

  /** `orders.discount`-gated (Owner/Manager only). Only allowed while the order isn't yet
   * financially settled (not PAID/COMPLETED/CANCELLED/REFUNDED — BILLED is fine), and only once
   * per order — the backend has no "remove/replace discount" endpoint, so a discount is
   * permanent once applied (see `OrdersService.applyDiscount`'s doc comment). Returns the full,
   * re-fetched order — server-recomputed totals, never trust a client-side calculation. */
  discount: (orderId: string, params: { type: DiscountType; value: number; reason?: string }) =>
    apiRequest<Order>(`/orders/${orderId}/discount`, {
      method: 'POST',
      body: {
        type: params.type,
        value: params.value,
        ...(params.reason ? { reason: params.reason } : {}),
      },
    }),
};

export const billingApi = {
  /** Idempotent on the backend — safe to call again if a staff member double-taps "Generate
   * bill" or retries after a dropped connection. */
  generateInvoice: (orderId: string) =>
    apiRequest<Invoice>(`/orders/${orderId}/invoice`, { method: 'POST' }),

  getInvoiceByOrder: (orderId: string) => apiRequest<Invoice>(`/orders/${orderId}/invoice`),

  recordPayment: (orderId: string, method: PaymentMethod, amount: string) =>
    apiRequest<void>(`/orders/${orderId}/payments`, {
      method: 'POST',
      body: { method, amount: Number(amount) },
    }),

  /** Re-sends the same receipt ticket `generateInvoice` already prints automatically on the
   * first call — for a printer that was off/out of paper at that moment, or a second copy for
   * the customer. Safe to call as many times as needed; each call queues one more print job. */
  printInvoice: (invoiceId: string) =>
    apiRequest<{ queued: boolean }>(`/invoices/${invoiceId}/print`, { method: 'POST' }),
};

/** `payments.refund`-gated (Owner/Manager only — same permission covers both steps below, so
 * there's no separate "approver" role to design a handoff for in v1). A refund is two backend
 * calls: `initiateRefund` creates a `PENDING` `Refund` row, `approveRefund` immediately (same
 * user, same permission) moves it to `PROCESSED` and applies it — see
 * `PaymentsService.approveRefund`'s doc comment. There's no "reject" endpoint. **Important**:
 * approving any refund — even a small partial one — on a payment belonging to a PAID/COMPLETED
 * order flips the *whole order's* status to REFUNDED (one-way, no way back); the UI must warn
 * about this before submitting, not just for full refunds. */
export const paymentsApi = {
  /** `GET /orders/:orderId/payments` — the only endpoint that returns each payment's `refunds`
   * array; `order.payments` embedded on `GET /orders/:id` does not include it. */
  list: (orderId: string) => apiRequest<PaymentSummary[]>(`/orders/${orderId}/payments`),

  initiateRefund: (paymentId: string, params: { amount: string; reason?: string }) =>
    apiRequest<Refund>(`/payments/${paymentId}/refund`, {
      method: 'POST',
      body: { amount: Number(params.amount), ...(params.reason ? { reason: params.reason } : {}) },
    }),

  approveRefund: (refundId: string) =>
    apiRequest<Refund>(`/payments/refunds/${refundId}/approve`, { method: 'POST' }),
};

/** `printers.manage`-gated (Owner/Manager only — see `PrintersController`) — registering a
 * printer here is what makes `services/print-agent` able to see and drain jobs for it. This
 * app never talks to a physical printer itself; see `docs/printing.md`. */
export const printersApi = {
  list: () => apiRequest<Printer[]>('/printers'),

  create: (params: {
    name: string;
    type: PrinterType;
    connectionType: PrinterConnectionType;
    ipAddress?: string;
    port?: number;
  }) =>
    apiRequest<Printer>('/printers', {
      method: 'POST',
      body: {
        name: params.name,
        type: params.type,
        connectionType: params.connectionType,
        ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
        ...(params.port ? { port: params.port } : {}),
      },
    }),

  /** Last 50 jobs for one printer, newest first — no pagination/status filter on this endpoint
   * (`PrintersService.listJobs`). Backs the printer health/job-history view; see `PrinterJob`'s
   * doc comment in `@dineeasy/shared-types` for what's (not) reliably in `payload`. */
  jobs: (printerId: string) => apiRequest<PrinterJob[]>(`/printers/${printerId}/jobs`),

  /** Staff-initiated retry for a `FAILED` job — resets it to `QUEUED` with a fresh attempts
   * budget so the print agent's next poll picks it back up. Only legal on a `FAILED` job (the
   * backend 400s otherwise); was read-only until now, see `PrintersService.retryJob`'s doc
   * comment on the backend for why. */
  retryJob: (jobId: string) => apiRequest<PrinterJob>(`/printers/jobs/${jobId}/retry`, { method: 'POST' }),
};
