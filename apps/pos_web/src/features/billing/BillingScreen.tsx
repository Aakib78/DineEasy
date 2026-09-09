import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Decimal from 'decimal.js';
import type { Order, OrderStatus } from '@dineeasy/shared-types';
import { ordersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { formatMoney } from '../../lib/cart/price';
import { useRealtimeEvent } from '../../lib/realtime/RealtimeContext';

const BILLABLE_STATUSES = new Set<OrderStatus>(['SERVED', 'BILLED', 'PAID']);

function todayIso(): string {
  // UTC, matching OrdersService.listCompletedForOutlet's day-boundary convention (server UTC,
  // not outlet-local — the same v1 simplification documented on DailyCounterService).
  return new Date().toISOString().slice(0, 10);
}

/**
 * Two tabs: "Incomplete" (orders ready to bill or awaiting payment — `GET /orders`, which
 * already excludes COMPLETED/CANCELLED/REFUNDED) and "Completed" (`GET /orders/completed`, one
 * calendar day at a time via a date filter, defaulting to today). Reuses `GET /orders` rather
 * than a dedicated endpoint for the first tab — same approach as
 * `apps/restaurant_app/lib/features/billing/billing_screen.dart`.
 *
 * The Completed tab exists to close a real gap: once an order settles to COMPLETED it drops off
 * the Incomplete list, and until this existed there was no way back to its detail screen to
 * reprint the receipt if staff navigated away right after taking payment. See
 * `OrdersService.listCompletedForOutlet`'s doc comment and docs/printing.md.
 */
export function BillingScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'incomplete' | 'completed'>('incomplete');
  const [date, setDate] = useState(todayIso);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [completed, setCompleted] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadActive = useCallback(async () => {
    try {
      setOrders(await ordersApi.listActive());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load orders.');
    }
  }, []);

  const loadCompleted = useCallback(async (forDate: string) => {
    try {
      setCompleted(await ordersApi.listCompleted(forDate));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load completed orders.');
    }
  }, []);

  useEffect(() => {
    void loadActive();
  }, [loadActive]);

  useEffect(() => {
    void loadCompleted(date);
  }, [date, loadCompleted]);

  // A partial payment or a served order from a different terminal shows up here live — see
  // PaymentsService.recordPayment's doc comment on why every payment (not just fully-settling
  // ones) emits this hint. Only re-checks Completed when today is the selected day — an order
  // settling elsewhere can't affect a past day's already-fixed list.
  useRealtimeEvent('order.updated', () => {
    void loadActive();
    if (date === todayIso()) void loadCompleted(date);
  });

  if (error) {
    return (
      <div className="empty-state">
        <p>{error}</p>
        <button
          className="secondary-button"
          onClick={() => {
            setError(null);
            void loadActive();
            void loadCompleted(date);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const billable = orders?.filter((o) => BILLABLE_STATUSES.has(o.status)) ?? null;

  return (
    <div className="billing-screen">
      <div className="payment-method-row">
        <button
          className={`method-chip${tab === 'incomplete' ? ' method-chip--active' : ''}`}
          onClick={() => setTab('incomplete')}
        >
          Incomplete{billable ? ` (${billable.length})` : ''}
        </button>
        <button
          className={`method-chip${tab === 'completed' ? ' method-chip--active' : ''}`}
          onClick={() => setTab('completed')}
        >
          Completed
        </button>
      </div>

      {tab === 'incomplete' ? (
        billable === null ? (
          <p className="loading-text">Loading orders…</p>
        ) : billable.length === 0 ? (
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
                      {order.table
                        ? `${order.table.name} · ${order.orderNumber}`
                        : `Takeaway · ${order.orderNumber}`}
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
        )
      ) : (
        <>
          <label className="field billing-screen__date-field">
            Date
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>

          {completed === null ? (
            <p className="loading-text">Loading orders…</p>
          ) : completed.length === 0 ? (
            <div className="empty-state">
              <p>No completed orders on this date.</p>
            </div>
          ) : (
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
          )}
        </>
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
