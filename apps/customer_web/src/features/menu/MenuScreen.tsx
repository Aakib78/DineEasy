import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMenu } from '../../lib/api/qr';
import { ApiError } from '../../lib/api/client';
import { useSession } from '../../lib/session/SessionContext';
import { useCart } from '../../lib/cart/CartContext';
import type { MenuCategory, MenuItem } from '../../lib/api/types';
import { MenuItemCard } from './MenuItemCard';
import { ItemCustomizeSheet } from './ItemCustomizeSheet';
import { CartBar } from '../../components/CartBar';
import { Header } from '../../components/Header';
import { categoryIcon } from '../../lib/menu/food-icon';

export function MenuScreen() {
  const { session, clearSession } = useSession();
  const { addLine } = useCart();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<MenuCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    fetchMenu(session.sessionToken)
      .then((data) => {
        if (!cancelled) setCategories(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.statusCode === 401) {
          // Dining-session token expired/invalid — send the diner back to square one rather
          // than showing a dead menu screen.
          clearSession();
          navigate('/', { replace: true });
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load the menu.');
      });

    return () => {
      cancelled = true;
    };
  }, [session, clearSession, navigate]);

  if (!session) return null; // RequireSession guarantees this never renders, but keeps TS happy

  return (
    <div className="screen">
      <Header tableName={session.table.name} outletName={session.outletName} />

      {error && <p className="error-banner">{error}</p>}

      {!categories && !error && <p className="loading-text">Loading the menu…</p>}

      {categories?.length === 0 && <p className="loading-text">This menu is empty right now.</p>}

      {categories?.map((category) => (
        <section key={category.id} className="menu-category">
          <h2 className="menu-category__heading">
            <span className="menu-category__icon" aria-hidden="true">
              {categoryIcon(category.name)}
            </span>
            {category.name}
          </h2>
          {category.description && <p className="menu-category__description">{category.description}</p>}
          <div className="menu-item-grid">
            {category.items.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                categoryName={category.name}
                onSelect={() => setActiveItem(item)}
              />
            ))}
          </div>
        </section>
      ))}

      {activeItem && (
        <ItemCustomizeSheet
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onAdd={addLine}
        />
      )}

      <CartBar />
    </div>
  );
}
