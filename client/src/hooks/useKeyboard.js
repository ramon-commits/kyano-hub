import { useEffect } from 'react';

function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}

export function useKeyboard(handlers, { enabled = true, allowInInput = false } = {}) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e) {
      if (!allowInInput && isTextField(e.target)) {
        // Allow Escape to always work
        if (e.key !== 'Escape') return;
      }
      const handler = handlers[e.key];
      if (handler) {
        const result = handler(e);
        if (result === true) {
          e.preventDefault();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, enabled, allowInInput]);
}
