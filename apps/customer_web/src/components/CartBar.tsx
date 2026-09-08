import { useNavigate } from 'react-router-dom';
import { useCart } from '../lib/cart/CartContext';
import { cartSubtotal, formatMoney } from '../lib/cart/price-estimate';

/** Sticky bottom bar that appears once the cart has anything in it — the diner's persistent
 *  path from browsing into checkout, visible on the menu screen. */
export function CartBar() {
  const { lines, itemCount } = useCart();
  const navigate = useNavigate();

  if (lines.length === 0) return null;

  return (
    <button className="cart-bar" onClick={() => navigate('/cart')}>
      <span>
        {itemCount} item{itemCount === 1 ? '' : 's'}
      </span>
      <span>View cart · {formatMoney(cartSubtotal(lines))}</span>
    </button>
  );
}
