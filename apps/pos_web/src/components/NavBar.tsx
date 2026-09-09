import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

/** Persistent top bar across every authenticated screen — tab switching (Tables/Billing) plus
 * whoever's signed in and a way to sign out. A POS terminal has no "back" affordance beyond
 * this, so it doubles as the app's only always-visible navigation. */
export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="nav-bar">
      <div className="nav-bar__brand">
        <span className="nav-bar__mark" aria-hidden="true">
          🍽️
        </span>
        <span className="nav-bar__title">DineEasy POS</span>
      </div>

      <nav className="nav-bar__tabs">
        <NavLink to="/" end className={({ isActive }) => `nav-bar__tab${isActive ? ' nav-bar__tab--active' : ''}`}>
          Tables
        </NavLink>
        <NavLink
          to="/billing"
          className={({ isActive }) => `nav-bar__tab${isActive ? ' nav-bar__tab--active' : ''}`}
        >
          Billing
        </NavLink>
      </nav>

      <div className="nav-bar__user">
        <span className="nav-bar__user-name">{user?.name}</span>
        <button className="text-button" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
