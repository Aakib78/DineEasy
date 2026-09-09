import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { applyTheme } from '@dineeasy/shared-types';
import { SessionProvider } from './lib/session/SessionContext';
import { CartProvider } from './lib/cart/CartContext';
import { App } from './App';
import './index.css';

// Centralized brand palette (packages/shared_types/src/theme.ts) — see that file's doc comment
// for why this app no longer hand-declares its own `:root` color values as the source of truth
// (index.css keeps a literal fallback copy, overwritten by this call in normal operation).
// Must run before the first render so nothing ever paints with the un-themed default.
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
