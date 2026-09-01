// useActiveRefetch — "only the page you're looking at refetches".
//
// App.tsx keeps every visited tab MOUNTED forever (display:none), so realtime
// events and app-resume handlers on every visited page used to refetch
// invisibly — multiplying server load by the number of tabs a user ever
// touched. This hook gives a page one notify() to call from its realtime
// callbacks:
//   - page active + document visible  → refetch, throttled to one per 2s
//     (absorbs the visibility+focus+reconnect triple-fire on app resume);
//   - otherwise → just mark the page stale; ONE refetch fires the moment the
//     page becomes the active tab / the app returns to the foreground.
// It also owns the page's visibilitychange/focus listeners, so callers delete
// theirs. Realtime subscriptions themselves stay connected — only the
// refetching is gated.
import { useEffect, useRef, useCallback } from 'react';

const THROTTLE_MS = 2000;

export function useActiveRefetch(active: boolean, refetch: () => void) {
  const activeRef = useRef(active);
  const stale = useRef(false);
  // Primed to "now": pages fetch on mount themselves, so the channel's
  // immediate SUBSCRIBED notify must not duplicate that first fetch.
  const lastRun = useRef(Date.now());
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const run = useCallback(() => {
    if (Date.now() - lastRun.current < THROTTLE_MS) return;
    lastRun.current = Date.now();
    stale.current = false;
    refetchRef.current();
  }, []);

  const notify = useCallback(() => {
    if (activeRef.current && document.visibilityState === 'visible') run();
    else stale.current = true;
  }, [run]);

  // Switching back to this tab: refresh once if anything happened meanwhile.
  useEffect(() => {
    activeRef.current = active;
    if (active && stale.current) run();
  }, [active, run]);

  // App resume / window refocus: catch up (realtime never replays missed
  // events). focus stays alongside visibilitychange — returning to the
  // browser from another WINDOW doesn't always change visibility.
  useEffect(() => {
    const onWake = () => { if (document.visibilityState === 'visible' && activeRef.current) run(); };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [run]);

  return notify;
}
