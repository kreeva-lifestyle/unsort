import { supabase } from './supabase';
import type { PrintSlot, PrintJobInsert } from '../types/database';
import type { PageSize } from './qzPrint';

export type { PrintSlot, PageSize };

export function getPrintMode(): 'cloud' | 'default' {
  return (localStorage.getItem('print_mode') as 'cloud' | 'default') || 'default';
}

export function setPrintMode(mode: 'cloud' | 'default'): void {
  localStorage.setItem('print_mode', mode);
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
