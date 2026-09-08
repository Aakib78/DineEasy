import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchOrder } from '../../lib/api/orders';
import { ApiError } from '../../lib/api/client';
import { useSession } from '../../lib/session/SessionContext';
import { useOrderUpdates } from '../../lib/realtime/useOrderUpdates';
import type { Order, OrderStatus } from '../../lib/api/types';
import { formatMoney } from '../../lib/cart/price-estimate';

const TRACKED_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PLACED', label: 'Order placed' },
  { status: 'ACCEPTED', label: 'Confirmed by the kitchen' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'READY', label: 'Ready' },
  { status: 'SERVED', label: 'Served' },
];

/** Where a cancelled/refunded order — or one already past SERVED into billing — sits relative
 *  to the tracked happy-path steps above, for highlighting the stepper. */
function stepIndex(status: OrderStatus): number {
  const idx = TRACKED_STEPS.findIndex((s) => s.status === status);
  if (idx >= 0) return idx;
  if (['BILLED', 'PAID', 'COMPLETED'].includes(status)) return TRACKED_STEPS.length - 1;
  return -1; // CANCELLED / REFUNDED / DRAFT — no step highlighted
}

const POLL_INTERVAL_MS = 15_000;

export function OrderStatusScreen() {
  const { orderId } = useParams<{ orderId: string }>();
  const { session } = useSession();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!session || !orderId) return;
    fetchOrder(session.sessionToken, orderId)
      .then(setOrder)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not load this order.');
      });
  }, [session, orderId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Realtime hint — see useOrderUpdates's doc comment on why this is a hint, not the data itself.
  useOrderUpdates(session?.sessionToken, refetch);

  // Polling fallback (docs/qr-ordering.md: "falling back to poll-on-reconnect so a flaky guest
  // Wi-Fi connection never leaves the tracking screen stuck") — runs regardless of whether the
  // socket connected, since a dropped WebSocket doesn't always surface as an error we can see.
  useEffect(() => {
    if (!session || !orderId) return;
    const interval = setInterval(refetch, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, orderId, refetch]);

  if (!session) return null;

  if (error) {
    return (
      <div className="screen">
        <p className="error-banner">{error}</p>
        <button className="secondary-button" onClick={() => navigate('/menu')}>
          Back to menu
        </button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="screen">
        <p className="loading-text">Loading your order…</p>
      </div>
    );
  }

  const currentStep = stepIndex(order.status);
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REFUNDED';

  return (
    <div className="screen">
      <h1>Order #{order.orderNumber}</h1>

      {isCancelled ? (
        <p className="error-banner">This order was cancelled.</p>
      ) : (
        <ol className="status-stepper">
          {TRACKED_STEPS.map((step, i) => (
            <li
              key={step.status}
              className={
                i <= currentStep ? 'status-stepper__step status-stepper__step--done' : 'status-stepper__step'
              }
            >
              {step.label}
            </li>
          ))}
        </ol>
      )}

      <ul className="cart-line-list">
        {order.items
          .filter((item) => !item.isCancelled)
          .map((item) => (
            <li key={item.id} className="cart-line">
              <div className="cart-line__info">
                <strong>
                  {item.quantity}× {item.nameSnapshot}
                </strong>
                {item.variantNameSnapshot && (
                  <span className="cart-line__variant">{item.variantNameSnapshot}</span>
                )}
                {item.modifiers.length > 0 && (
                  <span className="cart-line__modifiers">
                    {item.modifiers.map((m) => m.nameSnapshot).join(', ')}
                  </span>
                )}
                <span className="cart-line__price">{formatMoney(item.total)}</span>
              </div>
            </li>
          ))}
      </ul>

      <p className="order-total">
        Total: <strong>{formatMoney(order.total)}</strong>
      </p>
      <p className="cart-estimate-note">Pay at the counter when you're ready, unless your restaurant offers online payment.</p>

      <button className="secondary-button" onClick={() => navigate('/menu')}>
        Order more
      </button>
    </div>
  );
}
