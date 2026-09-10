import type { Order } from '@dineeasy/shared-types';

/**
 * Shared between `OrderScreen` (an existing order's status banner) and `TablesScreen` (the
 * active-takeaway-orders list) — split into its own file rather than exported from
 * `OrderScreen.tsx` so both stay plain component-only modules (React Fast Refresh only works
 * cleanly when a file exports just components — oxlint's `only-export-components` rule flags
 * mixing in a constant).
 */
export const STATUS_LABELS: Record<Order['status'], string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  BILLED: 'Billed',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};
