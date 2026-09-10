import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { MenuCategory, MenuItem, Order } from '@dineeasy/shared-types';
import { PERMISSIONS } from '@dineeasy/shared-types';
import { menuApi, ordersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthContext';
import { PosCartProvider, usePosCart } from '../../lib/cart/PosCartContext';
import { ItemCustomizeSheet } from './ItemCustomizeSheet';
import { CartPanel } from './CartPanel';
import { STATUS_LABELS } from './orderStatusLabels';

interface OrderScreenState {
  type: 'DINE_IN' | 'TAKEAWAY';
  tableId: string | null;
  tableName: string | null;
  existingOrderId: string | null;
}

// Mirrors OrdersService.cancelItem's `itemsLockedFrom` guard: once a bill exists, line items are
// frozen even before payment, since the bill already reflects them.
const ITEM_CANCEL_LOCKED: ReadonlySet<Order['status']> = new Set([
  'BILLED',
  'PAID',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
]);

// Mirrors the order-state-machine's CANCELLED transitions: reachable from every pre-payment
// status, never once PAID/COMPLETED (money has moved by then — see `assertOrderTransition`).
const ORDER_CANCELLABLE: ReadonlySet<Order['status']> = new Set([
  'DRAFT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'BILLED',
]);

/**
 * Menu browsing + cart building for one table (or a takeaway slot) — the web equivalent of
 * `apps/restaurant_app/lib/features/pos/order_builder_screen.dart`. Two distinct submit
 * outcomes live behind this one screen on purpose: starting a brand-new order
 * (`POST /orders`) and adding items to one already placed for this table
 * (`POST /orders/:id/items`) are the same UX from a staff member's point of view — "build a
 * cart, send it to the kitchen" — even though they're different backend calls.
 * `existingOrderId` (found by TablesScreen before navigating here) decides which.
 *
 * Wraps the actual screen in its own PosCartProvider so every navigation here starts a fresh
 * cart — see PosCartContext's doc comment on why the cart is scoped per order-in-progress.
 */
export function OrderScreen() {
  return (
    <PosCartProvider>
      <OrderScreenInner />
    </PosCartProvider>
  );
}

function OrderScreenInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const state = location.state as OrderScreenState | null;

  const [categories, setCategories] = useState<MenuCategory[] | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [existingOrder, setExistingOrder] = useState<Order | null>(null);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serving, setServing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { lines, addLine, clear } = usePosCart();

  useEffect(() => {
    menuApi
      .getFullTree()
      .then(setCategories)
      .catch((err: unknown) => setMenuError(err instanceof ApiError ? err.message : 'Could not load the menu.'));
  }, []);

  useEffect(() => {
    if (!state?.existingOrderId) return;
    let cancelled = false;
    ordersApi
      .getById(state.existingOrderId)
      .then((order) => {
        if (!cancelled) setExistingOrder(order);
      })
      .catch(() => {
        // Best-effort — the order banner just won't show if this fails; addItems below still
        // works regardless since it re-reads the order server-side.
      });
    return () => {
      cancelled = true;
    };
  }, [state?.existingOrderId]);

  // No navigation state means this screen was reached by a direct URL/refresh, which this v1
  // deliberately doesn't support (see PosCartContext's doc comment: no persisted cart to
  // resume anyway). Send them back to a screen that makes sense.
  if (!state) return <Navigate to="/" replace />;

  async function handleSubmit() {
    if (lines.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (existingOrder) {
        await ordersApi.addItems(existingOrder.id, lines);
      } else {
        await ordersApi.createOrder({
          type: state!.type,
          tableId: state!.tableId ?? undefined,
          items: lines,
        });
      }
      clear();
      navigate('/');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not send the order.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkServed() {
    if (!existingOrder) return;
    setServing(true);
    try {
      await ordersApi.serve(existingOrder.id);
      navigate('/');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not mark this order served.');
    } finally {
      setServing(false);
    }
  }

  // See ordersApi.accept's doc comment — this is a front-of-house acknowledgment, not a kitchen
  // gate, so staying on this screen afterward (rather than navigating away like Mark served does)
  // is deliberate: accepting is usually the first step toward adding items, not the last action
  // taken here.
  async function handleAccept() {
    if (!existingOrder) return;
    setAccepting(true);
    setSubmitError(null);
    try {
      setExistingOrder(await ordersApi.accept(existingOrder.id));
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not accept this order.');
    } finally {
      setAccepting(false);
    }
  }

  async function handleCancelItem(itemId: string) {
    if (!existingOrder) return;
    setCancellingItemId(itemId);
    setSubmitError(null);
    try {
      setExistingOrder(await ordersApi.cancelItem(existingOrder.id, itemId));
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not cancel this item.');
    } finally {
      setCancellingItemId(null);
    }
  }

  async function handleCancelOrder() {
    if (!existingOrder) return;
    setCancellingOrder(true);
    setSubmitError(null);
    try {
      await ordersApi.cancel(existingOrder.id, cancelReason.trim() || undefined);
      clear();
      navigate('/');
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not cancel this order.');
      setCancellingOrder(false);
    }
  }

  const canUpdateOrder = hasPermission(PERMISSIONS.ORDERS_UPDATE);
  const canCancelOrder = hasPermission(PERMISSIONS.ORDERS_CANCEL);
  const activeItems = existingOrder?.items.filter((i) => !i.isCancelled) ?? [];
  const canCancelItems = existingOrder ? !ITEM_CANCEL_LOCKED.has(existingOrder.status) : false;
  const orderIsCancellable = existingOrder ? ORDER_CANCELLABLE.has(existingOrder.status) : false;

  return (
    <div className="order-screen">
      <div className="order-screen__header">
        <button className="text-button" onClick={() => navigate('/')}>
          ← Back
        </button>
        <h1>{state.type === 'TAKEAWAY' ? 'Takeaway order' : `Table ${state.tableName ?? ''}`}</h1>
      </div>

      {existingOrder && (
        <div className="existing-order-card">
          <div className="existing-order-banner">
            <span>
              Order #{existingOrder.orderNumber} — {STATUS_LABELS[existingOrder.status]} ·{' '}
              {activeItems.length} {activeItems.length === 1 ? 'item' : 'items'} already sent
            </span>
            <div className="existing-order-banner__actions">
              {existingOrder.status === 'PLACED' && canUpdateOrder && (
                <button
                  className="secondary-button secondary-button--compact"
                  onClick={() => void handleAccept()}
                  disabled={accepting}
                >
                  {accepting ? 'Accepting…' : 'Accept order'}
                </button>
              )}
              {existingOrder.status === 'READY' && canUpdateOrder && (
                <button
                  className="secondary-button secondary-button--compact"
                  onClick={() => void handleMarkServed()}
                  disabled={serving}
                >
                  {serving ? 'Marking…' : 'Mark served'}
                </button>
              )}
            </div>
          </div>

          {activeItems.length > 0 && (
            <ul className="existing-order-items">
              {activeItems.map((item) => (
                <li key={item.id} className="existing-order-items__row">
                  <span>
                    {item.quantity}× {item.nameSnapshot}
                    {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''}
                  </span>
                  {canCancelOrder && canCancelItems && (
                    <button
                      className="text-button existing-order-items__cancel"
                      onClick={() => void handleCancelItem(item.id)}
                      disabled={cancellingItemId === item.id}
                    >
                      {cancellingItemId === item.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canCancelOrder && orderIsCancellable && (
            <div className="existing-order-cancel">
              {confirmingCancel ? (
                <>
                  <label className="field">
                    Reason (optional)
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </label>
                  <p className="existing-order-cancel__warning">
                    This voids the whole order — every item, sent or not. It can't be undone.
                  </p>
                  <div className="existing-order-banner__actions">
                    <button
                      className="secondary-button secondary-button--compact"
                      onClick={() => void handleCancelOrder()}
                      disabled={cancellingOrder}
                    >
                      {cancellingOrder ? 'Cancelling…' : 'Confirm cancel'}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setConfirmingCancel(false);
                        setCancelReason('');
                      }}
                      disabled={cancellingOrder}
                    >
                      Never mind
                    </button>
                  </div>
                </>
              ) : (
                <button className="text-button existing-order-cancel__trigger" onClick={() => setConfirmingCancel(true)}>
                  Cancel this order
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {submitError && <p className="error-banner">{submitError}</p>}

      <div className="order-screen__menu">
        {menuError && (
          <div className="empty-state">
            <p>{menuError}</p>
          </div>
        )}
        {!categories && !menuError && <p className="loading-text">Loading the menu…</p>}
        {categories?.length === 0 && <p className="empty-state__hint">No menu items published for this outlet yet.</p>}

        {categories?.map((category) => (
          <section key={category.id} className="menu-category">
            <h2>{category.name}</h2>
            <div className="pos-item-grid">
              {category.items.map((item) => (
                <button
                  key={item.id}
                  className="pos-item-tile"
                  disabled={!item.isAvailable}
                  onClick={() => setActiveItem(item)}
                >
                  <span className={`veg-dot ${item.isVegetarian ? 'veg-dot--veg' : 'veg-dot--nonveg'}`} aria-hidden="true" />
                  <span className="pos-item-tile__name">{item.name}</span>
                  <span className="pos-item-tile__price">
                    {item.variants.length > 0 ? 'From ' : ''}
                    ₹{Number(item.basePrice).toFixed(0)}
                  </span>
                  {!item.isAvailable && <span className="unavailable-badge">Unavailable</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {activeItem && (
        <ItemCustomizeSheet item={activeItem} onClose={() => setActiveItem(null)} onAdd={addLine} />
      )}

      <CartPanel
        submitLabel={submitting ? 'Sending…' : existingOrder ? 'Send to kitchen' : 'Place order'}
        onSubmit={() => void handleSubmit()}
        disabled={submitting || lines.length === 0}
      />
    </div>
  );
}
