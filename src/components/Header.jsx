import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { loginUrl } from '../hooks/useAuth';
import { IS_SUPPORT_CONFIGURED, SUPPORT_URL } from '../config/appConfig';
import Button from './Button';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18">
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.4l6.5-6.5C35.3 2.6 30 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.6 5.9C12 13 17.5 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.6c-.5 3-2.2 5.4-4.7 7.1l7.3 5.7c4.2-3.9 6.8-9.7 6.8-17.1z" />
      <path fill="#FBBC05" d="M10.1 19.1a14.5 14.5 0 0 0 0 9.8l-7.6 5.9a24 24 0 0 1 0-21.6l7.6 5.9z" />
      <path fill="#34A853" d="M24 48c6 0 11.3-2 15-5.4l-7.3-5.7c-2 1.4-4.6 2.2-7.7 2.2-6.5 0-12-4.4-14-10.3l-7.6 5.9C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="#5865F2">
      <path d="M20.3 4.4A18.6 18.6 0 0 0 15.7 3l-.3.5a13 13 0 0 1 3.9 1.6 15.6 15.6 0 0 0-15 0A13 13 0 0 1 8.2 3.5L7.9 3a18.6 18.6 0 0 0-4.6 1.4C1 8.6.3 12.7.6 16.7a18.7 18.7 0 0 0 5.7 2.9l.9-1.5a12 12 0 0 1-1.9-.9l.5-.4a13.4 13.4 0 0 0 11.4 0l.5.4a12 12 0 0 1-1.9.9l.9 1.5a18.6 18.6 0 0 0 5.7-2.9c.4-4.6-.7-8.6-2.9-12.3ZM8.7 14.3c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9Zm6.6 0c-.9 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9Z" />
    </svg>
  );
}

export default function Header() {
  const { user, backendReachable, checked, logout } = useAuthContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const mobileNavRef = useRef(null);
  const mobileBtnRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && btnRef.current) {
        if (!menuRef.current.contains(e.target) && !btnRef.current.contains(e.target)) {
          setMenuOpen(false);
        }
      }
      if (mobileNavRef.current && mobileBtnRef.current) {
        if (!mobileNavRef.current.contains(e.target) && !mobileBtnRef.current.contains(e.target)) {
          setMobileNavOpen(false);
        }
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Close the mobile drawer automatically on navigation, and on Escape
  // for keyboard users -- a stuck-open overlay is a common mobile-nav bug.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setMobileNavOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const returnTo = location.pathname + location.search;

  return (
    <nav className="site-nav">
      <div className="container">
        <Link to="/" className="brand">
          <svg className="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="12" r="9.2" />
            <path d="M12 2.8v18.4M2.8 12h18.4M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />
          </svg>
          Meridian
        </Link>

        <div className="nav-links">
          <Link to="/">Play</Link>
          <Link to="/profile">Profile</Link>
          {user?.isAdmin && <Link to="/admin">Admin</Link>}
          {IS_SUPPORT_CONFIGURED && (
            <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
              Support
            </a>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            ref={mobileBtnRef}
            className="mobile-nav-btn"
            aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            {mobileNavOpen ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>

          <div className="account-slot">
            {!checked ? (
              <div className="spinner" style={{ width: 16, height: 16, margin: 0 }} />
            ) : (
              <>
                <button ref={btnRef} className="avatar-btn" onClick={() => setMenuOpen((o) => !o)}>
                  <span className="avatar-circle">{(user?.name || user?.email || 'G').charAt(0).toUpperCase()}</span>
                  <span className="avatar-btn-label">{user ? user.name || user.email : 'Guest'}</span>
                </button>
                <div ref={menuRef} className={`account-menu${menuOpen ? ' open' : ''}`}>
                  {user ? (
                    <>
                      <p>Signed in via {user.provider}</p>
                      <Link to="/profile">
                        <Button variant="ghost" size="sm" block as="span">
                          View profile
                        </Button>
                      </Link>
                      <div className="account-menu-divider" />
                      <Button variant="danger-ghost" size="sm" block onClick={() => { logout(); setMenuOpen(false); }}>
                        Log out
                      </Button>
                    </>
                  ) : backendReachable === false ? (
                    <p className="guest-note">
                      Sign-in isn't available in this deployment (no backend configured). You're playing as a guest —
                      stats are saved in this browser.
                    </p>
                  ) : (
                    <>
                      <p>Sign in to keep your stats across devices.</p>
                      <a className="provider-btn" href={loginUrl('google', returnTo)}>
                        <GoogleIcon /> Continue with Google
                      </a>
                      <a className="provider-btn" href={loginUrl('discord', returnTo)}>
                        <DiscordIcon /> Continue with Discord
                      </a>
                      <div className="account-menu-divider" />
                      <p className="guest-note">Playing as guest right now — your progress is saved in this browser only.</p>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile drawer: same destinations as .nav-links above, just shown
          via a toggle instead of being hidden outright below 620px (see
          styles/responsive.css) -- Play/Profile/Admin(if applicable)/Support
          remain reachable on a phone, not just on desktop. */}
      <div ref={mobileNavRef} className={`mobile-nav-panel${mobileNavOpen ? ' open' : ''}`}>
        <Link to="/" onClick={() => setMobileNavOpen(false)}>Play</Link>
        <Link to="/profile" onClick={() => setMobileNavOpen(false)}>Profile</Link>
        {user?.isAdmin && <Link to="/admin" onClick={() => setMobileNavOpen(false)}>Administrative Panel</Link>}
        {IS_SUPPORT_CONFIGURED && (
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileNavOpen(false)}>
            Support the game
          </a>
        )}
      </div>
    </nav>
  );
}
