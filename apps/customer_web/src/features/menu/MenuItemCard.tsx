import type { MenuItem } from '../../lib/api/types';
import { formatMoney } from '../../lib/cart/price-estimate';
import { foodIcon } from '../../lib/menu/food-icon';

export function MenuItemCard({
  item,
  categoryName,
  onSelect,
}: {
  item: MenuItem;
  categoryName: string;
  onSelect: () => void;
}) {
  const fromPrice = item.variants.length > 0
    ? Math.min(...item.variants.map((v) => Number(v.priceOverride)))
    : Number(item.basePrice);

  return (
    <button
      className="menu-item-card"
      onClick={onSelect}
      disabled={!item.isAvailable}
      aria-label={`${item.name}${item.isAvailable ? '' : ' — currently unavailable'}`}
    >
      {item.imageUrl ? (
        <img src={item.imageUrl} alt="" className="menu-item-card__image" />
      ) : (
        // No photograph on file (true for every item today — see food-icon.ts's doc comment) —
        // a plain emoji tile beats leaving this whole side of the card blank.
        <div
          className={`menu-item-card__icon ${item.isVegetarian ? 'menu-item-card__icon--veg' : 'menu-item-card__icon--nonveg'}`}
          aria-hidden="true"
        >
          {foodIcon(item.name, categoryName)}
        </div>
      )}
      <div className="menu-item-card__body">
        <div className="menu-item-card__title-row">
          <span className={`veg-dot ${item.isVegetarian ? 'veg-dot--veg' : 'veg-dot--nonveg'}`} aria-hidden="true" />
          <h3>{item.name}</h3>
        </div>
        {item.description && <p className="menu-item-card__description">{item.description}</p>}
        <div className="menu-item-card__footer">
          <span className="menu-item-card__price">
            {item.variants.length > 0 ? 'From ' : ''}
            {formatMoney(fromPrice)}
          </span>
          {!item.isAvailable && <span className="unavailable-badge">Unavailable</span>}
        </div>
      </div>
    </button>
  );
}
