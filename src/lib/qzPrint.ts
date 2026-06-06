import qz from 'qz-tray';
import { supabase, SUPABASE_ANON_KEY } from './supabase';
import type { PrintSlot } from '../types/database';

const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDDTCCAfWgAwIBAgIUXb0iRIMPYTGoJ6Ro9M3gf8b0tiQwDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLQXJ5YURlc2lnbnMwHhcNMjYwNjA2MDUxMjExWhcNMzYw
NjAzMDUxMjExWjAWMRQwEgYDVQQDDAtBcnlhRGVzaWduczCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBAKT0nKnkIhjxWPDA1mQbvg495uRAY9c7i0+5amoM
bN0BxBR4iwkWWC6yVkX6HTKO4Y7Fac+KID4IDy27o/gUt+H8qEW9ssdRGN9ppMbA
xu/O5QBohitlWGMCAXH6a/Lh7s3AxF1vDQRcezXp0ZGpKl52qFUUY0HWSdecUO0J
Q5OVI73WOa3+x1lzTTOP9CVX3nqv1Tb4vbVAqZy0zk7ikRtrte5XpZ1+SMJtIkp2
8iFG2UBq1smUi6mLQXX/Kpf4lI82TKC7kW0VR0uDcOcBV36A9pyJPMleBPMQR3zE
y21yFRdp58Eqlf8ghFzdtYWRZR2kAGNGe2ID3quSUA/Edx8CAwEAAaNTMFEwHQYD
VR0OBBYEFBUe7n2tN+vVwq9J7Htb6vDkNQehMB8GA1UdIwQYMBaAFBUe7n2tN+vV
wq9J7Htb6vDkNQehMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB
ABptvk169fjeCOgjA53/D5sldSW6HoUC5L43ScbXJ801eQXreyo94z4kaViMEPXl
WAdje3opn+bLDjxdyBB/52Zyd/qILlPBMuqJjy2h8d5fNkLCV05a0wZLh3hg0Z/R
e5hz7BKCB8lCKAl3UjzW1mY3Wf8Vxr4XalJb+1ktZ7L/QRDZ6dOCqBgcJUt+i5ub
70hmBmypaHNGLPHC6k37A7I6bfSPkrJ1uFrs6Hsb2L38auKXieLPDIklGtbccRHG
tzekJSODCKdD5VKQgT0mkaqmKKYqKcTnoJIjx6hvXGBB0SyhBGcGpzXMZXTFoKku
R22ZoK3Fpcq7kNmDf34bDWc=
-----END CERTIFICATE-----`;

const SUPABASE_URL = 'https://ulphprdnswznfztawbvg.supabase.co';

let securityConfigured = false;

function setupSecurity() {
  if (securityConfigured) return;
  qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
    resolve(QZ_CERTIFICATE);
  });
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign: string) => {
    return (async () => {
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
      return signature;
    })();
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
  if (qz.websocket.isActive()) return;
  if (connecting) return connecting;
  setupSecurity();
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
