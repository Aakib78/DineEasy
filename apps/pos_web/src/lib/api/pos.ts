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
  Printer,
  PrinterType,
  PrinterConnectionType,
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

  /** READY -> SERVED — see OrderScreen's doc comment on why this is its own explicit action. */
  serve: (orderId: string) => apiRequest<Order>(`/orders/${orderId}/serve`, { method: 'POST' }),
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
};
