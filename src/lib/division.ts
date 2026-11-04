// The two divisions of DailyOffice (owner, 2026-11-04): DailyWork = the app as
// it is today (inventory, cash, packing, jobwork…); Playbook = a separate
// division built later in src/playbook/ with its own rules
// (src/playbook/CLAUDE.md). The one picked on the login screen is remembered
// on this device and can be switched from inside either division.
import { useEffect, useState } from 'react';

export type Division = 'dailywork' | 'playbook';
export const DIVISIONS: { id: Division; name: string; tagline: string }[] = [
  { id: 'dailywork', name: 'DailyWork', tagline: 'Inventory, cash, packing, jobwork' },
  { id: 'playbook', name: 'Playbook', tagline: 'Plans and dashboards' },
];

const KEY = 'do-division';
const EVT = 'do-division-change';

// This page's choice. Kept here too, so that when storage is blocked or full
// every part of the page still agrees on the division until a reload.
let current: Division | null = null;

export function getDivision(): Division {
  if (current) return current;
  try { current = localStorage.getItem(KEY) === 'playbook' ? 'playbook' : 'dailywork'; } catch { current = 'dailywork'; }
  return current;
}

export function setDivision(d: Division) {
  current = d;
  try { localStorage.setItem(KEY, d); } catch { /* private mode: the choice lasts this page only */ }
  window.dispatchEvent(new CustomEvent<Division>(EVT, { detail: d }));
}

/** The current division; re-renders when it is switched anywhere in the app. */
export function useDivision(): Division {
  const [d, setD] = useState<Division>(getDivision);
  useEffect(() => {
    const on = (e: Event) => setD((e as CustomEvent<Division>).detail);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return d;
}
