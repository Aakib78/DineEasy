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
 *
 * Also lists today's already-COMPLETED orders below the active list (`GET /orders/completed`,
 * `ordersApi.listCompleted`) — closes a real gap: once an order settles to COMPLETED it drops
 * off the active list above, and until this existed there was no way back to its detail screen
 * to reprint the receipt if a cashier navigated away right after taking payment. See
 * `OrdersService.listCompletedForOutlet`'s doc comment and docs/printing.md.
 */
export function BillingScreen() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [completed, setCompleted] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [active, done] = await Promise.all([ordersApi.listActive(), ordersApi.listCompleted()]);
      setOrders(active);
      setCompleted(done);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load orders.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A partial payment or a served order from a different terminal shows up here live — see
  // PaymentsService.recordPayment's doc comment on why every payment (not just fully-settling
  // ones) emits this hint. Also covers an order settling to COMPLETED elsewhere, which is what
  // moves it from the active list into "Recently completed" below.
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

  if (!orders || !completed) return <p className="loading-text">Loading orders…</p>;

  const billable = orders.filter((o) => BILLABLE_STATUSES.has(o.status));

  return (
    <div className="billing-screen">
      {billable.length === 0 ? (
        <div className="empty-state">
          <p>No orders waiting to be billed.</p>
        </div>
      ) : (
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
      )}

      {completed.length > 0 && (
        <section className="billing-screen__completed">
          <h2 className="billing-screen__completed-heading">Recently completed</h2>
          <p className="billing-screen__completed-hint">
            Fully paid, today. Open one to reprint its receipt.
          </p>
          <ul className="billing-list">
            {completed.map((order) => (
              <li key={order.id}>
                <button className="billing-tile" onClick={() => navigate(`/billing/${order.id}`)}>
                  <div className="billing-tile__info">
                    <span className="billing-tile__title">
                      {order.table
                        ? `${order.table.name} · ${order.orderNumber}`
                        : `Takeaway · ${order.orderNumber}`}
                    </span>
                    <span className="billing-tile__status billing-tile__status--success">Completed</span>
                  </div>
                  <span className="billing-tile__total">{formatMoney(order.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
