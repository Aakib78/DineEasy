import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Decimal from 'decimal.js';
import type { Order, OrderStatus } from '@dineeasy/shared-types';
import { ordersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { formatMoney } from '../../lib/cart/price';
import { useRealtimeEvent } from '../../lib/realtime/RealtimeContext';

const BILLABLE_STATUSES = new Set<OrderStatus>(['SERVED', 'BILLED', 'PAID']);

/**
 * Orders ready to bill (SERVED, awaiting `POST /orders/:id/invoice`) or already billed and
 * awaiting payment (BILLED, or the brief in-flight PAID moment before the backend auto-advances
 * it to COMPLETED). Reuses `GET /orders` (already excludes COMPLETED/CANCELLED/REFUNDED) rather
 * than a dedicated endpoint — same approach as
 * `apps/restaurant_app/lib/features/billing/billing_screen.dart`.
 */
export function BillingScreen() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await ordersApi.listActive());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load orders.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A partial payment or a served order from a different terminal shows up here live — see
  // PaymentsService.recordPayment's doc comment on why every payment (not just fully-settling
  // ones) emits this hint.
  useRealtimeEvent('order.updated', () => void load());

  if (error) {
    return (
      <div className="empty-state">
        <p>{error}</p>
        <button className="secondary-button" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!orders) return <p className="loading-text">Loading orders…</p>;

  const billable = orders.filter((o) => BILLABLE_STATUSES.has(o.status));

  if (billable.length === 0) {
    return (
      <div className="empty-state">
        <p>No orders waiting to be billed.</p>
      </div>
    );
  }

  return (
    <ul className="billing-list">
      {billable.map((order) => (
        <li key={order.id}>
          <button className="billing-tile" onClick={() => navigate(`/billing/${order.id}`)}>
            <div className="billing-tile__info">
              <span className="billing-tile__title">
                {order.table ? `${order.table.name} · ${order.orderNumber}` : `Takeaway · ${order.orderNumber}`}
              </span>
              <span className={`billing-tile__status billing-tile__status--${statusTone(order)}`}>
                {statusLabel(order)}
              </span>
            </div>
            <span className="billing-tile__total">{formatMoney(order.total)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function paidSoFar(order: Order): Decimal {
  return (order.payments ?? [])
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
}

function statusLabel(order: Order): string {
  const remaining = new Decimal(order.total).minus(paidSoFar(order));
  switch (order.status) {
    case 'SERVED':
      return 'Ready to bill';
    case 'BILLED':
      return remaining.lessThanOrEqualTo(0) ? 'Fully paid' : 'Awaiting payment';
    case 'PAID':
      return 'Settling…';
    default:
      return '';
  }
}

function statusTone(order: Order): 'info' | 'success' | 'warning' {
  const remaining = new Decimal(order.total).minus(paidSoFar(order));
  switch (order.status) {
    case 'SERVED':
      return 'info';
    case 'BILLED':
      return remaining.lessThanOrEqualTo(0) ? 'success' : 'warning';
    case 'PAID':
      return 'success';
    default:
      return 'info';
  }
}
