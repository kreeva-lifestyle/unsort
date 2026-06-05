import qz from 'qz-tray';
import type { PrintSlot } from '../types/database';

const SLOT_KEYS: Record<PrintSlot, string> = {
  label_small: 'qz_printer_label_small',
  label_large: 'qz_printer_label_large',
  document: 'qz_printer_document',
};

const SLOT_LABELS: Record<PrintSlot, string> = {
  label_small: 'Label Printer (Small)',
  label_large: 'Label Printer (Large)',
  document: 'Document Printer',
};

export { SLOT_LABELS };

let connecting: Promise<void> | null = null;

export async function connect(): Promise<void> {
  if (qz.websocket.isActive()) return;
  if (connecting) return connecting;
  connecting = qz.websocket.connect().finally(() => { connecting = null; });
  await connecting;
}

export async function disconnect(): Promise<void> {
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

export function isConnected(): boolean {
  return qz.websocket.isActive();
}

export async function listPrinters(): Promise<string[]> {
  await connect();
  return qz.printers.find() as Promise<string[]>;
}

export function getSlotPrinter(slot: PrintSlot): string | null {
  return localStorage.getItem(SLOT_KEYS[slot]) || null;
}

export function setSlotPrinter(slot: PrintSlot, printerName: string | null): void {
  if (printerName) localStorage.setItem(SLOT_KEYS[slot], printerName);
  else localStorage.removeItem(SLOT_KEYS[slot]);
}

export type PageSize = { width: number; height: number } | 'A4';

export async function printHtml(printerName: string, html: string, pageSize: PageSize, copies = 1): Promise<void> {
  await connect();
  const size = pageSize === 'A4' ? { width: 8.27, height: 11.69 } : pageSize;
  const config = qz.configs.create(printerName, {
    size: { width: size.width, height: size.height },
    units: 'in',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    copies,
    scaleContent: true,
  });
  const data = [{ type: 'html', format: 'plain', data: html }];
  await qz.print(config, data);
}
