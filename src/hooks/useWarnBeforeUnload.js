import { useEffect } from 'react';

/**
 * Warns before an accidental tab close/refresh/back-navigation while a
 * game is actively in progress (not on setup screens, not once a game
 * has ended) -- a native browser confirmation, not an invasive custom
 * dialog on every action. Only ever attached while `active` is true, and
 * always cleaned up on unmount, so it can never linger after the
 * component that owns it is gone.
 */
export function useWarnBeforeUnload(active) {
  useEffect(() => {
    if (!active) return undefined;
    function handler(e) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
