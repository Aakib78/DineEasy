import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './routes/RequireAuth';
import { NavBar } from './components/NavBar';
import { LoginScreen } from './features/auth/LoginScreen';
import { TablesScreen } from './features/tables/TablesScreen';
import { OrderScreen } from './features/order/OrderScreen';
import { BillingScreen } from './features/billing/BillingScreen';
import { BillingDetailScreen } from './features/billing/BillingDetailScreen';
import { PrintersScreen } from './features/printers/PrintersScreen';

function AppShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <NavBar />
      <main className="app-main">{children}</main>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route
        path="/"
        element={
          <AppShell>
            <TablesScreen />
          </AppShell>
        }
      />
      <Route
        path="/order"
        element={
          <AppShell>
            <OrderScreen />
          </AppShell>
        }
      />
      <Route
        path="/billing"
        element={
          <AppShell>
            <BillingScreen />
          </AppShell>
        }
      />
      <Route
        path="/billing/:orderId"
        element={
          <AppShell>
            <BillingDetailScreen />
          </AppShell>
        }
      />
      <Route
        path="/printers"
        element={
          <AppShell>
            <PrintersScreen />
          </AppShell>
        }
      />
      <Route
        path="*"
        element={
          <AppShell>
            <p className="empty-state__hint">We couldn't find that page.</p>
          </AppShell>
        }
      />
    </Routes>
  );
}
