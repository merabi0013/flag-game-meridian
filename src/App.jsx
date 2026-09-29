import { BrowserRouter, Routes, Route } from 'react-router-dom';

// import.meta.env.BASE_URL always has a trailing slash (Vite convention,
// e.g. "/" locally or "/flag-game-meridian/" on GitHub Pages — see
// vite.config.js). react-router's `basename` wants no trailing slash.
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './screens/Home';
import Game from './screens/Game';
import Profile from './screens/Profile';
import AdminPanel from './screens/AdminPanel';
import PurchaseConfirm from './screens/PurchaseConfirm';
import MultiplayerSetup from './screens/MultiplayerSetup';

export default function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AuthProvider>
        <ToastProvider>
          <Header />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game" element={<Game />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/purchase/confirm" element={<PurchaseConfirm />} />
            <Route path="/multiplayer/setup" element={<MultiplayerSetup />} />
          </Routes>
          <Footer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
