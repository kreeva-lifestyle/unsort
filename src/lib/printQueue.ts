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

export async function submitPrintJob(
  slot: PrintSlot,
  html: string,
  pageSize: PageSize,
  title?: string,
  copies?: number,
): Promise<{ error: Error | null }> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (!user || authErr) return { error: new Error('You must be logged in to print') };
  if (html.length > MAX_HTML_BYTES) return { error: new Error('Print content too large (max 1 MB)') };
  const row: PrintJobInsert = {
    printer_slot: slot,
    html,
    page_size: pageSize === 'A4' ? 'A4' : { width: pageSize.width, height: pageSize.height },
    copies: copies ?? 1,
    title: title ?? null,
    created_by: user.id,
  };
  const { error } = await supabase.from('print_queue').insert(row);
  return { error: error ? new Error(error.message) : null };
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
): Promise<{ error: Error | null }> {
  if (getPrintMode() === 'cloud') {
    return submitPrintJob(slot, html, pageSize, title, copies);
  }
  browserPrint(html);
  return { error: null };
}
