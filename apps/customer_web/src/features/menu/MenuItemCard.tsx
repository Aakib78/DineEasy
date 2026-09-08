import type { MenuItem } from '../../lib/api/types';
import { formatMoney } from '../../lib/cart/price-estimate';

export function MenuItemCard({ item, onSelect }: { item: MenuItem; onSelect: () => void }) {
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
      {item.imageUrl && <img src={item.imageUrl} alt="" className="menu-item-card__image" />}
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
