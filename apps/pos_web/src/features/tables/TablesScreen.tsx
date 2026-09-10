import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Floor, RestaurantTable, Order } from '@dineeasy/shared-types';
import { tablesApi, ordersApi } from '../../lib/api/pos';
import { ApiError } from '../../lib/api/client';
import { useRealtimeEvent } from '../../lib/realtime/RealtimeContext';
import { STATUS_LABELS } from '../order/orderStatusLabels';

/**
 * The landing screen: a floor-by-floor table grid plus a Takeaway entry point — mirrors
 * `apps/restaurant_app/lib/features/pos/pos_home_screen.dart`'s mental model. This screen only
 * ever *finds or starts* an order; all menu browsing/cart building happens one level down in
 * OrderScreen, so this screen's job stays legible: "which table (or takeaway slot) am I
 * working on?"
 *
 * A dine-in order always has a reopen path even after staff navigate away — tapping its table
 * again finds it via `activeOrders`. A takeaway order has no table, so before the "Active
 * takeaway orders" list below existed, a takeaway order placed and then navigated away from
 * was permanently unreachable: it never appears in Billing's "Incomplete" tab (billable only
 * from SERVED onward) or anywhere in the Kitchen Display (which has no order-detail
 * navigation), so nothing could ever accept it, mark it served, or cancel it. This list is
 * that missing reopen path — the takeaway equivalent of tapping an occupied table.
 */
export function TablesScreen() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState<Floor[] | null>(null);
  const [tables, setTables] = useState<RestaurantTable[] | null>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [floorsData, tablesData, ordersData] = await Promise.all([
        tablesApi.listFloors(),
        tablesApi.listTables(),
        ordersApi.listActive(),
      ]);
      setFloors(floorsData);
      setTables(tablesData);
      setActiveOrders(ordersData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load tables.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Another terminal placing a QR order, a different staff member marking something served, or
  // a table's occupancy changing elsewhere would otherwise sit stale here until a manual
  // refresh — see billing_screen.dart's identical reasoning on the Flutter side.
  useRealtimeEvent('order.updated', () => void load());
  useRealtimeEvent('table.updated', () => void load());

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

  if (!floors || !tables) {
    return <p className="loading-text">Loading tables…</p>;
  }

  const sortedFloors = [...floors].sort((a, b) => a.displayOrder - b.displayOrder);
  const effectiveFloorId = sortedFloors.some((f) => f.id === selectedFloorId)
    ? selectedFloorId
    : (sortedFloors[0]?.id ?? null);

  const tableIdsWithOrders = new Set(
    activeOrders.filter((o) => o.tableId).map((o) => o.tableId as string),
  );
  const visibleTables = effectiveFloorId
    ? tables.filter((t) => t.floorId === effectiveFloorId)
    : [];
  const activeTakeawayOrders = [...activeOrders]
    .filter((o) => o.type === 'TAKEAWAY')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function openTable(table: RestaurantTable) {
    const existingOrder = activeOrders.find((o) => o.tableId === table.id);
    navigate('/order', {
      state: {
        type: 'DINE_IN',
        tableId: table.id,
        tableName: table.name,
        existingOrderId: existingOrder?.id ?? null,
      },
    });
  }

  function startTakeaway() {
    navigate('/order', { state: { type: 'TAKEAWAY', tableId: null, tableName: null, existingOrderId: null } });
  }

  function openTakeawayOrder(order: Order) {
    navigate('/order', {
      state: { type: 'TAKEAWAY', tableId: null, tableName: null, existingOrderId: order.id },
    });
  }

  return (
    <div className="tables-screen">
      {sortedFloors.length > 1 && (
        <div className="floor-tabs">
          {sortedFloors.map((floor) => (
            <button
              key={floor.id}
              className={`floor-chip${floor.id === effectiveFloorId ? ' floor-chip--active' : ''}`}
              onClick={() => setSelectedFloorId(floor.id)}
            >
              {floor.name}
            </button>
          ))}
        </div>
      )}

      <div className="tables-screen__header">
        <h1>Tables</h1>
        <button className="primary-button primary-button--compact" onClick={startTakeaway}>
          🛍️ Takeaway
        </button>
      </div>

      {activeTakeawayOrders.length > 0 && (
        <div className="tables-screen__takeaway-section">
          <h2 className="tables-screen__section-title">
            Active takeaway orders ({activeTakeawayOrders.length})
          </h2>
          <ul className="billing-list">
            {activeTakeawayOrders.map((order) => {
              const activeItemCount = order.items.filter((i) => !i.isCancelled).length;
              return (
                <li key={order.id}>
                  <button className="billing-tile" onClick={() => openTakeawayOrder(order)}>
                    <div className="billing-tile__info">
                      <span className="billing-tile__title">🛍️ {order.orderNumber}</span>
                      <span className="billing-tile__status billing-tile__status--info">
                        {STATUS_LABELS[order.status]} · {activeItemCount}{' '}
                        {activeItemCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <span className="billing-tile__total">₹{Number(order.total).toFixed(0)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {visibleTables.length === 0 ? (
        <p className="empty-state__hint">No tables on this floor yet.</p>
      ) : (
        <div className="table-grid">
          {visibleTables.map((table) => {
            const hasActiveOrder = tableIdsWithOrders.has(table.id);
            const statusClass = hasActiveOrder
              ? 'table-tile--order-open'
              : `table-tile--${table.status.toLowerCase()}`;
            return (
              <button
                key={table.id}
                className={`table-tile ${statusClass}`}
                onClick={() => openTable(table)}
              >
                <span className="table-tile__name">{table.name}</span>
                <span className="table-tile__meta">
                  {hasActiveOrder ? 'Order open' : table.status.charAt(0) + table.status.slice(1).toLowerCase()}
                </span>
                <span className="table-tile__capacity">{table.capacity} seats</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
