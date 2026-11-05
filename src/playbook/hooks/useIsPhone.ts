// Phone layout switch for Playbook, in JS. Same query as index.css's phone
// rules and .modal-inner's bottom sheet, so layout and sheet flip together.
// Use it only to swap a whole layout; sizes come from CSS variables.
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 768px)';
const mql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);

const subscribe = (cb: () => void) => {
  const m = mql();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => mql()?.matches ?? false, () => false);
}
