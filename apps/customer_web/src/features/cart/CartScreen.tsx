import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../lib/cart/CartContext';
import { useSession } from '../../lib/session/SessionContext';
import { cartSubtotal, formatMoney, lineTotal } from '../../lib/cart/price-estimate';
import { placeOrder } from '../../lib/api/orders';
import { ApiError } from '../../lib/api/client';

export function CartScreen() {
  const { lines, removeLine, setQuantity, clear } = useCart();
  const { session } = useSession();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  async function handlePlaceOrder() {
    if (!session) return; // RequireSession guarantees this, but keeps the closure's type narrow
    setError(null);
    setPlacing(true);
    try {
      const order = await placeOrder(session.sessionToken, { notes: notes.trim() || undefined, items: lines });
      clear();
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not place your order — please try again.',
      );
    } finally {
      setPlacing(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="screen">
        <p className="loading-text">Your cart is empty.</p>
        <button className="secondary-button" onClick={() => navigate('/menu')}>
          Back to menu
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <h1>Your order</h1>

      <ul className="cart-line-list">
        {lines.map((line) => (
          <li key={line.lineId} className="cart-line">
            <div className="cart-line__info">
              <strong>{line.menuItemName}</strong>
              {line.variantName && <span className="cart-line__variant">{line.variantName}</span>}
              {line.modifierSummaries.length > 0 && (
                <span className="cart-line__modifiers">
                  {line.modifierSummaries.map((m) => m.name).join(', ')}
                </span>
              )}
              {line.notes && <span className="cart-line__notes">Note: {line.notes}</span>}
              <span className="cart-line__price">{formatMoney(lineTotal(line))}</span>
            </div>
            <div className="cart-line__controls">
              <button
                className="icon-button"
                onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span>{line.quantity}</span>
              <button
                className="icon-button"
                onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
              <button className="text-button" onClick={() => removeLine(line.lineId)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <label className="notes-field">
        Notes for the whole order (optional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>

      <p className="cart-estimate-note">
        Estimated subtotal: <strong>{formatMoney(cartSubtotal(lines))}</strong>. Tax and any
        service charge are added when the restaurant confirms your order.
      </p>

      {error && <p className="error-banner">{error}</p>}

      <button className="primary-button" onClick={handlePlaceOrder} disabled={placing}>
        {placing ? 'Placing order…' : 'Place order'}
      </button>
      <button className="secondary-button" onClick={() => navigate('/menu')} disabled={placing}>
        Add more items
      </button>
    </div>
  );
}
