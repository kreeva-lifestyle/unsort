import { supabase } from './supabase';
import type { PrintSlot, PrintJobInsert } from '../types/database';
import type { PageSize } from './qzPrint';

export type { PrintSlot, PageSize };

type PrintMode = 'cloud' | 'default';

// Print mode is a GLOBAL setting (app_settings table) shared by all users &
// devices. localStorage holds a synchronous cache so printOrQueue stays sync;
// the DB is the source of truth, loaded on startup + kept live via realtime.
export function getPrintMode(): PrintMode {
  return (localStorage.getItem('print_mode') as PrintMode) || 'default';
}

export async function setPrintMode(mode: PrintMode): Promise<{ error: Error | null }> {
  localStorage.setItem('print_mode', mode);
  const { error } = await supabase.from('app_settings')
    .upsert({ key: 'print_mode', value: mode, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return { error: error ? new Error(error.message) : null };
}

// Fetch the global mode into the localStorage cache + subscribe to live changes.
// Call once on app startup. Returns an unsubscribe function.
export function initGlobalPrintMode(): () => void {
  supabase.from('app_settings').select('value').eq('key', 'print_mode').maybeSingle()
    .then(({ data }) => {
      const v = data?.value;
      if (v === 'cloud' || v === 'default') localStorage.setItem('print_mode', v);
    });
  const chan = supabase.channel('app-settings-print-mode')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.print_mode' },
      (payload) => {
        const v = (payload.new as { value?: unknown })?.value;
        if (v === 'cloud' || v === 'default') localStorage.setItem('print_mode', v);
      })
    .subscribe();
  return () => { supabase.removeChannel(chan); };
}

const MAX_HTML_BYTES = 1_048_576; // 1 MB

type AddToast = (msg: string, type?: string) => void;

// Cheap dedup so a fast double-click doesn't create two identical jobs.
const recentSubmits = new Map<string, { jobId: string; ts: number }>();
const DEDUP_WINDOW_MS = 3000;
function dedupKey(slot: PrintSlot, html: string): string {
  let h = 0;
  for (let i = 0; i < html.length; i++) { h = (h * 31 + html.charCodeAt(i)) | 0; }
  return `${slot}:${html.length}:${h}`;
}

export async function submitPrintJob(
  slot: PrintSlot,
  html: string,
  pageSize: PageSize,
  title?: string,
  copies?: number,
): Promise<{ error: Error | null; jobId: string | null }> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return { error: new Error('You must be logged in to print'), jobId: null };
  if (html.length > MAX_HTML_BYTES) return { error: new Error('Print content too large (max 1 MB)'), jobId: null };

  // Duplicate-submit guard: same content + slot within the window → reuse job.
  const key = dedupKey(slot, html);
  const prev = recentSubmits.get(key);
  if (prev && Date.now() - prev.ts < DEDUP_WINDOW_MS) {
    return { error: null, jobId: prev.jobId };
  }

  const row: PrintJobInsert = {
    printer_slot: slot,
    html,
    page_size: pageSize === 'A4' ? 'A4' : { width: pageSize.width, height: pageSize.height },
    copies: copies ?? 1,
    title: title ?? null,
    created_by: user.id,
  };
  const { data, error } = await supabase.from('print_queue').insert(row).select('id').single();
  if (error || !data) return { error: new Error(error?.message || 'Failed to queue print'), jobId: null };
  recentSubmits.set(key, { jobId: data.id, ts: Date.now() });
  return { error: null, jobId: data.id };
}

// Watch a submitted job and report its fate to the user via toast.
async function watchPrintJob(jobId: string, addToast: AddToast) {
  const { friendlyPrintError } = await import('./qzPrint');
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(pendingTimer);
    clearTimeout(capTimer);
    supabase.removeChannel(chan);
  };
  const handle = (status?: string, errMsg?: string | null) => {
    if (status === 'done') { addToast('Printed ✓', 'success'); finish(); }
    else if (status === 'failed') { addToast(friendlyPrintError(errMsg), 'error'); finish(); }
  };
  // If no station claims it within 25s, warn the user.
  const pendingTimer = setTimeout(async () => {
    const { data } = await supabase.from('print_queue').select('status').eq('id', jobId).maybeSingle();
    if (!settled && (data?.status === 'pending' || !data)) {
      addToast('No print station picked this up — check the print computer.', 'error');
    }
  }, 25_000);
  // Hard cap so we never leak a subscription. 5 min covers a station that
  // comes back online a few minutes after the job was queued.
  const capTimer = setTimeout(finish, 300_000);
  const chan = supabase.channel(`print-job-${jobId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'print_queue', filter: `id=eq.${jobId}` },
      (payload) => { const n = payload.new as { status?: string; error_message?: string | null }; handle(n?.status, n?.error_message); })
    .subscribe();
  // Catch the case where it already resolved before the subscription attached.
  const { data } = await supabase.from('print_queue').select('status, error_message').eq('id', jobId).maybeSingle();
  if (data) handle(data.status, data.error_message);
}

// Print Stations beat this app_settings key every 45s while QZ is connected.
// If nobody has beaten recently, the submitter deserves an immediate warning
// instead of discovering it via the 25s pending check.
const HEARTBEAT_STALE_MS = 3 * 60_000;
async function warnIfStationOffline(addToast: AddToast) {
  try {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'print_station_heartbeat').maybeSingle();
    const last = data?.value ? new Date(data.value as string).getTime() : 0;
    if (Date.now() - last > HEARTBEAT_STALE_MS) {
      addToast('Print station appears offline — the job is queued and will print when it comes back on.', 'error');
    }
  } catch { /* heartbeat check is best-effort; the 25s watcher still covers it */ }
}

function browserPrint(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;width:0;height:0;border:none;';
  document.body.appendChild(iframe);
  const iw = iframe.contentWindow;
  if (!iw) return;
  iw.document.open();
  iw.document.write(html);
  iw.document.close();
  iframe.onload = () => {
    iw.focus();
    iw.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  };
}

export async function printOrQueue(
  slot: PrintSlot,
  html: string,
  pageSize: PageSize,
  title?: string,
  copies?: number,
  addToast?: AddToast,
): Promise<{ error: Error | null }> {
  if (getPrintMode() === 'cloud') {
    const { error, jobId } = await submitPrintJob(slot, html, pageSize, title, copies);
    if (addToast) {
      if (error) addToast(error.message, 'error');
      else {
        addToast('Print job sent', 'success');
        if (jobId) watchPrintJob(jobId, addToast);
        warnIfStationOffline(addToast);
      }
    }
    return { error };
  }
  browserPrint(html);
  return { error: null };
}
