// PackStation: sending a scan to packtime_scans, and the scans still waiting
// to be sent. Each scan carries how long it waited on this phone (queued_ms),
// so a scan made while the Wi-Fi was down keeps the time it was really
// scanned (the server subtracts the wait; migration
// 20261020074737_packtime_scans_real_scan_time) — Pack Cam then cuts the
// right footage for it.
import { supabase } from '../../lib/supabase';
import type { PackTimeScanInsert } from '../../types/database';

/** Insert a scan made at `at` (this phone's clock; ms). */
export const sendScan = (row: PackTimeScanInsert, at?: number) =>
  supabase.from('packtime_scans').insert(at ? { ...row, queued_ms: Math.max(0, Math.min(86_400_000, Date.now() - at)) } : row);

// Scans whose DB insert failed twice — parked here so the operator can retry
// from the banner. Persisted to localStorage: module scope survives unmount
// but NOT a refresh or an evicted PWA tab, which is exactly when a shop-floor
// phone loses them. `at` = when it was scanned (older parked scans lack it).
export type FailedDbScan = { scanRow: PackTimeScanInsert; sheetRow: unknown[]; sheetName: string; at?: number };
const FAILED_KEY = 'packtime_failed_db_scans';
export const failedDbScans: FailedDbScan[] = (() => {
  try { const raw = localStorage.getItem(FAILED_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch { return []; }
})();
export const persistFailed = () => { try { localStorage.setItem(FAILED_KEY, JSON.stringify(failedDbScans.slice(0, 500))); } catch { /* quota */ } };
