/**
 * useEnterToAdvance.js
 * -----------------------------------------------------------------------
 * Enter = "Next flag" once a question has been answered.
 *
 * Why this is a document-level listener instead of living in
 * AnswerInput's existing onKeyDown: once an answer is submitted the text
 * input is disabled, and a disabled input (or an Easy-mode multiple-choice
 * button that was just clicked) can't receive key events, so there's no
 * focused element to hear the keypress. AnswerInput's own Enter handling
 * (submit a guess, pick an autocomplete suggestion) is untouched — this
 * only covers the phase AnswerInput can't: "answered, waiting for Next".
 *
 * One listener is attached for the lifetime of the screen; it reads the
 * latest `enabled`/`onAdvance` through a ref, so it is never stale and
 * never re-attached when game state changes.
 * -----------------------------------------------------------------------
 */
import { useEffect, useRef } from 'react';

// Elements that already give Enter a meaning of their own. Letting them
// handle it (and skipping ours) is what prevents a double action — e.g.
// Enter on the focused "Next flag" button fires that button's native
// click, and the input's Enter is what submitted the answer in the first
// place.
const OWN_ENTER_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);

export function useEnterToAdvance(enabled, onAdvance) {
  const latest = useRef({ enabled, onAdvance });
  latest.current = { enabled, onAdvance };

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Enter' || e.repeat || e.defaultPrevented) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target;
      if (target && (OWN_ENTER_TAGS.has(target.tagName) || target.isContentEditable)) return;

      const { enabled: isEnabled, onAdvance: advance } = latest.current;
      if (!isEnabled) return;
      e.preventDefault();
      advance();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
