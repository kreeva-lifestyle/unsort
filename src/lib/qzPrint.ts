import { supabase, SUPABASE_ANON_KEY } from './supabase';
import type { PrintSlot } from '../types/database';

// qz-tray (~33 KB) is loaded lazily — only when a printer connection is
// actually needed, not eagerly when the Settings page mounts.
type QzModule = typeof import('qz-tray')['default'];
let qzPromise: Promise<QzModule> | null = null;
let qzCached: QzModule | null = null;

async function loadQz(): Promise<QzModule> {
  if (qzCached) return qzCached;
  if (!qzPromise) qzPromise = import('qz-tray').then(m => { qzCached = m.default; return qzCached; });
  return qzPromise;
}

const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDHTCCAgWgAwIBAgIUPnVAeqBjESkfClCOxPmzIBW+58swDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLQXJ5YURlc2lnbnMwHhcNMjYwNjA2MDYyNDMwWhcNMzYw
NjAzMDYyNDMwWjAWMRQwEgYDVQQDDAtBcnlhRGVzaWduczCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBALK91rJecc838MZvVaw/Gn0vAF/ZM0Ywx5FFDJYS
cCl814nJjOomTskRWOhwC8zLYvUcAMYF+k4WteKZ/g1f/GHBtUfX2yXQtxTMd+iI
bvDBEN1tHegV8ueXOS0DtLL/w1bvo/9m12RCQpu2alOolyK8MshUis6CCHvsfRRP
TQ0HLC+SEO3uSwMdzVHiS5jTYp9JXRVZG31gbWXY/14FnzRWMXX6TLI1bAVdk21P
k1GtGxzko5Wlxtgx/D5kzXZ2Ntz6V5h0+OeDTd/Ae+flQU2suJC3fiDmwp1ZQfW7
BBwMSKu0FO7ONXx+OJ4lpH/qrUKrJTxiPv0Vxojare8F7RMCAwEAAaNjMGEwHQYD
VR0OBBYEFIM3w7GVi88rQ//sq+kGIulr8yZ6MB8GA1UdIwQYMBaAFIM3w7GVi88r
Q//sq+kGIulr8yZ6MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMA0G
CSqGSIb3DQEBCwUAA4IBAQAX9lkKwhM6ngsy7cnbOhE1Kww0C9zH/N/zdvTjh6Re
0b8W8O1f8apqfDp56v+S0B0c4jsNbTj9CEkKab4J0OO+Qgv8Ou5mmMJcvpHOn10f
pxnkX85MWUNnOcTWyqmd0SyncWIbCBeqY4Fasg8msn5rKFG7eEl9Q7lExh7MtVTE
6xEKEwjw8t2d/+JCsmNVFjd6lk+J/uOWaFosnkwDMTZ5J/8bgs3J2EL+24gXRgy8
3R2GF/TI6E4Rng1blIg0ZZAzW3gwrBYL8mEixa28CiOrS9GKNXkebxpoEuHWivPN
e1DFL2YRsfJPWvnqW6lkm3jksL0Pqo91m/3TQYC+TZiM
-----END CERTIFICATE-----`;

const SUPABASE_URL = 'https://ulphprdnswznfztawbvg.supabase.co';

let securityConfigured = false;

function setupSecurity(qz: QzModule) {
  if (securityConfigured) return;
  qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
    resolve(QZ_CERTIFICATE);
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => {
    // QZ Tray calls `new Promise(this)`, so we must return a (resolve, reject)
    // executor function — not a Promise object.
    return (resolve: (sig: string) => void, reject: (err: unknown) => void) => {
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Not authenticated');
          const res = await fetch(`${SUPABASE_URL}/functions/v1/sign-qz`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ toSign }),
          });
          if (!res.ok) throw new Error('Signing failed');
          const { signature } = await res.json();
          resolve(signature);
        } catch (err) {
          reject(err);
        }
      })();
    };
  });
  securityConfigured = true;
}

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
  const qz = await loadQz();
  if (qz.websocket.isActive()) return;
  if (connecting) return connecting;
  setupSecurity(qz);
  connecting = qz.websocket.connect().finally(() => { connecting = null; });
  await connecting;
}

export async function disconnect(): Promise<void> {
  const qz = await loadQz();
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

export function isConnected(): boolean {
  return qzCached ? qzCached.websocket.isActive() : false;
}

export async function listPrinters(): Promise<string[]> {
  await connect();
  const qz = await loadQz();
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

// Map raw QZ Tray / websocket errors to messages shop staff can act on.
export function friendlyPrintError(msg: string | null | undefined): string {
  const m = (msg || '').toLowerCase();
  if (!m) return 'Print failed — please try again.';
  if (m.includes('websocket') || m.includes('connect') || m.includes('not running')) return 'QZ Tray is not running on the print computer.';
  if (m.includes('not found') || m.includes('unknown printer') || m.includes('no printer')) return 'Printer not found — check it is switched on and plugged in.';
  if (m.includes('timed out') || m.includes('timeout')) return 'Print timed out — check the printer (paper, power, connection).';
  if (m.includes('access') || m.includes('denied') || m.includes('permission')) return 'Printer access denied — check the printer is shared/available.';
  // Fall back to a trimmed raw message
  const raw = (msg || '').trim();
  return raw.length > 120 ? 'Print failed — check the printer.' : raw;
}

export async function printHtml(printerName: string, html: string, pageSize: PageSize, copies = 1): Promise<void> {
  await connect();
  const qz = await loadQz();
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
