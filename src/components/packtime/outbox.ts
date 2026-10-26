// PackStation outbox — every scan (and every undo) is written HERE, on the
// phone, the moment it happens, and leaves only when the server has
// confirmed it. A reload, a closed app, an evicted tab or a Wi-Fi drop can
// no longer lose a scan: the outbox is in localStorage and drains itself
// every 30 s, when the phone comes back online, when the app returns to the
// foreground and before sign-out. The sheet is no longer the phone's job —
// the server carries each saved scan to Google Sheets (migration
// 20261026100000_packtime_sheet_queue); after a successful send the phone
// kicks that sync so the sheet follows within seconds.
//
// Each scan carries how long it waited here (queued_ms), so a scan made
// while the Wi-Fi was down keeps the time it was really scanned.
import { supabase } from '../../lib/supabase';
import { logSwallowed } from '../../lib/errorLogger';
import { registerBeforeSignOut } from '../../lib/beforeSignOut';
import { callEdge } from './edge';
import type { PackTimeScanInsert } from '../../types/database';

export type OutboxItem =
  | { kind: 'scan'; id: string; scan: PackTimeScanInsert; at: number; attempts: number; error?: string; cancelled?: boolean }
  | { kind: 'undo'; id: string; scanId: string; awb: string; at: number; attempts: number; error?: string };
export interface OutboxState {
  /** Items still on the phone. */
  waiting: number;
  /** Of those, how many have failed at least once. */
  failing: number;
  sending: boolean;
  lastError: string;
  items: OutboxItem[];
}

const KEY = 'packtime_outbox';
const LEGACY_KEY = 'packtime_failed_db_scans';   // the old parked-scan list: taken over on first load
const SEND_TIMEOUT_MS = 8000;
const MAX_QUEUED_MS = 7 * 86_400_000;            // the server's cap (migration 20261020132901)
const DRAIN_EVERY_MS = 30_000;

const items: OutboxItem[] = (() => {
  try {
    const raw = localStorage.getItem(KEY); const arr = raw ? JSON.parse(raw) : [];
    const out: OutboxItem[] = Array.isArray(arr) ? arr : [];
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      for (const f of JSON.parse(legacy) || []) {
        if (f?.scanRow?.id && !out.some(i => i.id === f.scanRow.id)) out.push({ kind: 'scan', id: f.scanRow.id, scan: f.scanRow, at: f.at || Date.now(), attempts: 0 });
      }
      localStorage.removeItem(LEGACY_KEY);
    }
    return out;
  } catch { return []; }
})();
let sending = false, again = false, sendingId = '', lastError = '';
const listeners = new Set<(s: OutboxState) => void>();
const savedListeners = new Set<(id: string, how: 'saved' | 'duplicate') => void>();

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, 2000))); } catch (e) { logSwallowed('outbox persist', e); } };
export const getOutboxState = (): OutboxState => ({ waiting: items.length, failing: items.filter(i => i.attempts > 0).length, sending, lastError, items: items.slice() });
const emit = () => { const s = getOutboxState(); listeners.forEach(fn => { try { fn(s); } catch (e) { logSwallowed('outbox listener', e); } }); };
export function subscribeOutbox(fn: (s: OutboxState) => void): () => void { listeners.add(fn); fn(getOutboxState()); return () => { listeners.delete(fn); }; }
/** Fires with the scan id once the server has it — or refused it as a duplicate (another phone had it first). */
export function subscribeSaved(fn: (id: string, how: 'saved' | 'duplicate') => void): () => void { savedListeners.add(fn); return () => { savedListeners.delete(fn); }; }

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
}

let kickTimer: ReturnType<typeof setTimeout> | undefined;
/** Ask the server to carry what just landed to the sheet now, not at the next minute. Best effort. */
const kickSync = () => {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => { callEdge({ action: 'sync' }, 25000).then(r => { if (!r?.ok) logSwallowed('sheet sync kick', r?.details || r?.error); }); }, 2500);
};

/** Send everything in order. Serialized; a call during a run queues one more run. */
export async function drainOutbox(): Promise<void> {
  if (sending) { again = true; return; }
  if (items.length === 0) return;
  sending = true; emit();
  let landed = false;
  try {
    for (const item of items.slice()) {
      if (!items.includes(item)) continue;              // removed meanwhile (undo of an unsent scan)
      sendingId = item.id;
      try {
        if (item.kind === 'scan') {
          const row = { ...item.scan, sheet_by_server: true, queued_ms: Math.max(0, Math.min(MAX_QUEUED_MS, Date.now() - item.at)) };
          const { error } = await supabase.from('packtime_scans').insert(row).abortSignal(timeoutSignal(SEND_TIMEOUT_MS));
          if (error && error.code !== '23505') throw error;
          remove(item);
          const how = error ? 'duplicate' : 'saved';   // 23505 = the server already has this AWB from another phone
          if (item.cancelled) { if (!error) { items.push({ kind: 'undo', id: crypto.randomUUID(), scanId: item.id, awb: item.scan.awb, at: Date.now(), attempts: 0 }); persist(); } }
          else { if (!error) landed = true; savedListeners.forEach(fn => { try { fn(item.id, how); } catch (e) { logSwallowed('saved listener', e); } }); }
        } else {
          const { error } = await supabase.from('packtime_scans').delete().eq('id', item.scanId).abortSignal(timeoutSignal(SEND_TIMEOUT_MS));
          if (error) throw error;
          remove(item); landed = true;
        }
        lastError = '';
      } catch (e) {
        item.attempts += 1; item.error = (e as { message?: string })?.message || String(e); lastError = item.error;
        persist();
      }
      sendingId = '';
      emit();
    }
  } finally {
    sending = false; sendingId = '';
    emit();
    if (landed) kickSync();
    if (again) { again = false; void drainOutbox(); }
  }
}
function remove(item: OutboxItem) { const i = items.indexOf(item); if (i >= 0) items.splice(i, 1); persist(); }

/** A scan the packer just made: on the phone first, sent right away. */
export function enqueueScan(scan: PackTimeScanInsert, at: number): void {
  items.push({ kind: 'scan', id: scan.id!, scan, at, attempts: 0 });
  persist(); emit(); void drainOutbox();
}

/** Undo: a scan still on the phone is simply dropped; one already sent (or in flight) gets a delete queued. Returns which. */
export function enqueueUndo(scanId: string, awb: string): 'dropped' | 'queued' {
  const i = items.findIndex(it => it.kind === 'scan' && it.id === scanId);
  if (i >= 0 && items[i].id !== sendingId) { items.splice(i, 1); persist(); emit(); return 'dropped'; }
  if (i >= 0) { (items[i] as Extract<OutboxItem, { kind: 'scan' }>).cancelled = true; persist(); return 'queued'; }
  items.push({ kind: 'undo', id: crypto.randomUUID(), scanId, awb, at: Date.now(), attempts: 0 });
  persist(); emit(); void drainOutbox();
  return 'queued';
}

// Self-driving: the timer, the phone coming back, the app returning, sign-out.
if (typeof window !== 'undefined') {
  setInterval(() => { void drainOutbox(); }, DRAIN_EVERY_MS);
  window.addEventListener('online', () => { void drainOutbox(); });
  window.addEventListener('pageshow', () => { void drainOutbox(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void drainOutbox(); });
  registerBeforeSignOut(async () => { await drainOutbox(); });
  void drainOutbox();
}
