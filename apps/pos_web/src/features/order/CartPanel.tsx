import { usePosCart } from '../../lib/cart/PosCartContext';
import { cartSubtotal, formatMoney } from '../../lib/cart/price';

interface Props {
  submitLabel: string;
  onSubmit: () => void;
  disabled?: boolean;
}

/** Slide-up-from-bottom cart summary + submit button, always visible while building an order —
 * the web equivalent of `apps/restaurant_app/lib/features/pos/widgets/cart_panel.dart`. */
export function CartPanel({ submitLabel, onSubmit, disabled }: Props) {
  const { lines, removeLine, setQuantity, itemCount } = usePosCart();

  if (lines.length === 0) {
    return (
      <div className="cart-panel cart-panel--empty">
        <p>Tap a menu item to add it to this order.</p>
      </div>
    );
  }

  return (
    <div className="cart-panel">
      <ul className="cart-line-list">
        {lines.map((line) => (
          <li key={line.lineId} className="cart-line">
            <div className="cart-line__info">
              <span>
                {line.quantity}× {line.menuItemName}
                {line.variantName ? ` (${line.variantName})` : ''}
              </span>
              {line.modifierSummaries.length > 0 && (
                <span className="cart-line__modifiers">
                  {line.modifierSummaries.map((m) => m.name).join(', ')}
                </span>
              )}
              {line.notes && <span className="cart-line__notes">Note: {line.notes}</span>}
            </div>
            <div className="cart-line__controls">
              <button className="icon-button" onClick={() => setQuantity(line.lineId, line.quantity - 1)} aria-label="Decrease quantity">
                −
              </button>
              <span>{line.quantity}</span>
              <button className="icon-button" onClick={() => setQuantity(line.lineId, line.quantity + 1)} aria-label="Increase quantity">
                +
              </button>
              <button className="text-button" onClick={() => removeLine(line.lineId)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="cart-panel__footer">
        <div>
          <span className="cart-panel__count">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          <span className="cart-estimate-note">Estimate: {formatMoney(cartSubtotal(lines))}</span>
        </div>
        <button className="primary-button primary-button--compact" onClick={onSubmit} disabled={disabled}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
