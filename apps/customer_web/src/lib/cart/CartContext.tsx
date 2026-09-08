import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { CartLine } from './cart-types';

const STORAGE_KEY = 'dineeasy.cart';

type CartAction =
  | { type: 'add'; line: CartLine }
  | { type: 'remove'; lineId: string }
  | { type: 'setQuantity'; lineId: string; quantity: number }
  | { type: 'clear' };

function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add':
      return [...state, action.line];
    case 'remove':
      return state.filter((l) => l.lineId !== action.lineId);
    case 'setQuantity':
      if (action.quantity <= 0) {
        return state.filter((l) => l.lineId !== action.lineId);
      }
      return state.map((l) => (l.lineId === action.lineId ? { ...l, quantity: action.quantity } : l));
    case 'clear':
      return [];
  }
}

function loadInitialCart(): CartLine[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    // Corrupt/foreign data in storage — start with an empty cart rather than crashing the app.
    return [];
  }
}

interface CartContextValue {
  lines: CartLine[];
  addLine: (line: CartLine) => void;
  removeLine: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

/**
 * Per docs/qr-ordering.md: "the cart itself lives client-side ... until 'Place order'."
 * `sessionStorage` (not `localStorage`) so it lives and dies with the same browser tab as the
 * dining-session token (see lib/session/SessionContext.tsx) — a stale cart never outlives the
 * session it was built against.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, undefined, loadInitialCart);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Storage full/unavailable (private browsing) — the cart still works in-memory for this
      // page load, it just won't survive a refresh. Not worth surfacing as an error to a diner.
    }
  }, [lines]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      addLine: (line) => dispatch({ type: 'add', line }),
      removeLine: (lineId) => dispatch({ type: 'remove', lineId }),
      setQuantity: (lineId, quantity) => dispatch({ type: 'setQuantity', lineId, quantity }),
      clear: () => dispatch({ type: 'clear' }),
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    [lines],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
