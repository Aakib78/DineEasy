import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import type { PosCartLine } from './pos-cart-types';

type CartAction =
  | { type: 'add'; line: PosCartLine }
  | { type: 'remove'; lineId: string }
  | { type: 'setQuantity'; lineId: string; quantity: number }
  | { type: 'clear' };

function cartReducer(state: PosCartLine[], action: CartAction): PosCartLine[] {
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

interface PosCartContextValue {
  lines: PosCartLine[];
  addLine: (line: PosCartLine) => void;
  removeLine: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  clear: () => void;
  itemCount: number;
}

const PosCartContext = createContext<PosCartContextValue | undefined>(undefined);

/** Deliberately in-memory only, no `sessionStorage`/`localStorage` — see pos-cart-types.ts's
 * doc comment on why a POS terminal doesn't need a cart to survive a reload the way the guest
 * app's does. Scoped per order-in-progress: OrderScreen mounts/unmounts this provider around
 * itself (see routes/RequireAuth.tsx's sibling routing in App.tsx) so navigating away from an
 * order builder always starts the next one with an empty cart. */
export function PosCartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, []);

  const value = useMemo<PosCartContextValue>(
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

  return <PosCartContext.Provider value={value}>{children}</PosCartContext.Provider>;
}

export function usePosCart(): PosCartContextValue {
  const ctx = useContext(PosCartContext);
  if (!ctx) throw new Error('usePosCart must be used within a PosCartProvider');
  return ctx;
}
