import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/session/SessionContext';
import { RequireSession } from './routes/RequireSession';
import { ResolveRoute } from './routes/ResolveRoute';
import { ScanPrompt } from './features/entry/ScanPrompt';
import { MenuScreen } from './features/menu/MenuScreen';
import { CartScreen } from './features/cart/CartScreen';
import { OrderStatusScreen } from './features/order-status/OrderStatusScreen';

function RootRoute() {
  const { session } = useSession();
  return session ? <Navigate to="/menu" replace /> : <ScanPrompt />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/q/:token" element={<ResolveRoute />} />
      <Route
        path="/menu"
        element={
          <RequireSession>
            <MenuScreen />
          </RequireSession>
        }
      />
      <Route
        path="/cart"
        element={
          <RequireSession>
            <CartScreen />
          </RequireSession>
        }
      />
      <Route
        path="/orders/:orderId"
        element={
          <RequireSession>
            <OrderStatusScreen />
          </RequireSession>
        }
      />
      <Route path="*" element={<ScanPrompt message="We couldn't find that page." />} />
    </Routes>
  );
}
