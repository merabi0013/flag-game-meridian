import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authErrorMessage, providerLabel } from '../utils/authMessages';

// A one-time code must only ever be exchanged once, even if React (dev
// StrictMode) runs the effect twice.
const handledCodes = new Set();

const AUTH_PARAMS = ['auth_code', 'auth_error', 'auth_linked', 'return_to'];

/** Same-app paths only — never follow a redirect to another site. */
function safeInternalPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

/**
 * Renders nothing. When the backend sends the browser back here after a
 * sign-in (?auth_code=… / ?auth_error=… / ?auth_linked=…) this finishes the
 * job, shows a message, and removes those parameters from the address bar.
 */
export default function AuthCallbackHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const { completeLogin, refreshUser } = useAuthContext();
  const showToast = useToast();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!AUTH_PARAMS.some((k) => params.has(k))) return;

    const code = params.get('auth_code');
    const error = params.get('auth_error');
    const linked = params.get('auth_linked');
    const returnTo = safeInternalPath(params.get('return_to'));

    // Strip the sign-in parameters right away (keeping any others).
    const rest = new URLSearchParams(location.search);
    AUTH_PARAMS.forEach((k) => rest.delete(k));
    const cleanSearch = rest.toString() ? `?${rest.toString()}` : '';

    if (error) {
      showToast(authErrorMessage(error));
      navigate({ pathname: location.pathname, search: cleanSearch }, { replace: true });
      return;
    }

    if (linked) {
      refreshUser();
      showToast(`${providerLabel(linked)} connected to your account.`);
      navigate(returnTo, { replace: true });
      return;
    }

    if (code && !handledCodes.has(code)) {
      handledCodes.add(code);
      completeLogin(code)
        .then(() => {
          showToast('Signed in.');
          navigate(returnTo, { replace: true });
        })
        .catch((err) => {
          showToast(err.message);
          navigate({ pathname: location.pathname, search: cleanSearch }, { replace: true });
        });
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
