// The shift's starting point, kept on the phone: the numbers already on the
// courier's sheet (for the instant duplicate check) and the row count. When
// the start-of-shift read fails on weak Wi-Fi, the last good copy (≤ 24 h
// old) starts the shift anyway; the database still refuses a duplicate
// across phones, so the worst case is a late warning instead of no work.
export interface InitSnapshot { awbs: string[]; totalRows: number; at: number }

const KEY = (sheet: string) => `packtime_init.${sheet}`;
const MAX_AGE_MS = 24 * 3600_000;

export function saveInit(sheet: string, awbs: string[], totalRows: number): void {
  try { localStorage.setItem(KEY(sheet), JSON.stringify({ awbs, totalRows, at: Date.now() } satisfies InitSnapshot)); } catch { /* quota */ }
}

export function loadInit(sheet: string): InitSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY(sheet)); if (!raw) return null;
    const s = JSON.parse(raw) as InitSnapshot;
    if (!Array.isArray(s.awbs) || Date.now() - (s.at || 0) > MAX_AGE_MS) return null;
    return s;
  } catch { return null; }
}

/** "2 h ago", "35 min ago" — how old the saved copy is. */
export const ageText = (at: number): string => { const m = Math.round((Date.now() - at) / 60000); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
