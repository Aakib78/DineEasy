import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { applyTheme } from '@dineeasy/shared-types';
import { AuthProvider } from './lib/auth/AuthContext';
import { RealtimeProvider } from './lib/realtime/RealtimeContext';
import { App } from './App';
import './index.css';

// Centralized brand palette (packages/shared_types/src/theme.ts), shared with
// apps/customer_web — see that file's doc comment. Must run before the first render.
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <RealtimeProvider>
          <App />
        </RealtimeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
