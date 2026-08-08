import { NavLink } from 'react-router-dom';
import { useDemo } from '../lib/demo-state';

export function Navbar() {
  const { initialized, walletDid } = useDemo();

  const truncateDid = (did: string) =>
    did.length > 24 ? `${did.slice(0, 16)}...${did.slice(-6)}` : did;

  return (
    <nav className="navbar" id="main-nav">
      <div className="navbar-inner">
        <NavLink to="/" className="navbar-logo">
          <span className="logo-icon">⛓</span>
          BreakChain
        </NavLink>

        <div className="navbar-links">
          <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>
            Home
          </NavLink>
          <NavLink to="/issue" className={({ isActive }) => isActive ? 'active' : ''}>
            Issue
          </NavLink>
          <NavLink to="/verify" className={({ isActive }) => isActive ? 'active' : ''}>
            Verify
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>
            Admin
          </NavLink>
        </div>

        <div className="navbar-status">
          {initialized ? (
            <span className="status-badge connected">
              <span className="status-dot" />
              {truncateDid(walletDid || '')}
            </span>
          ) : (
            <span className="status-badge disconnected">
              <span className="status-dot" />
              Not connected
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}
