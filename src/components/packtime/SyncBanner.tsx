// The one strip above the scanner that says how the phone is doing: no
// internet / weak connection / scans being sent / scans that keep failing.
// Nothing here can throw a scan away — the old "Dismiss" is gone; the
// outbox retries by itself and "Show numbers" lists what is still waiting.
import { useState } from 'react';
import { T, S, alpha } from '../../lib/theme';
import type { Connection } from './connection';
import type { OutboxState } from './outbox';

export default function SyncBanner({ conn, outbox, onRetry }: { conn: Connection; outbox: OutboxState; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const { waiting, failing, sending } = outbox;
  const lastError = /fetch|network|abort/i.test(outbox.lastError) ? 'could not reach the server' : outbox.lastError;
  if (conn === 'online' && waiting === 0) return null;
  const tone = conn === 'offline' || failing > 0 ? T.re : T.yl;
  const title = conn === 'offline' ? 'No internet on this phone'
    : conn === 'weak' ? 'Connection is weak'
    : failing > 0 ? `${failing} scan${failing === 1 ? '' : 's'} could not be sent yet`
    : sending ? 'Sending…' : `${waiting} waiting to send`;
  const detail = conn === 'offline'
    ? `Keep scanning — ${waiting} scan${waiting === 1 ? ' is' : 's are'} kept on this phone and ${waiting === 1 ? 'goes' : 'go'} out with the real scan time when it is back.`
    : conn === 'weak'
    ? `Keep scanning — scans are kept on this phone and sent as the connection allows. ${waiting} waiting.`
    : failing > 0
    ? `They stay on this phone and are retried every 30 seconds${lastError ? ` (last error: ${lastError})` : ''}.`
    : `${waiting} scan${waiting === 1 ? '' : 's'} on the way to the server.`;
  return (
    <div style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 8, background: alpha(tone, 0.08), border: `1px solid ${alpha(tone, 0.35)}`, fontSize: 12, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, flexShrink: 0, animation: 'subtlePulse 2s ease-in-out infinite' }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, color: tone }}>{title}</div>
          <div style={{ color: T.tx2, marginTop: 2 }}>{detail}</div>
        </div>
        {waiting > 0 && <button type="button" onClick={() => setOpen(o => !o)} style={{ ...S.btnGhost, ...S.btnSm }}>{open ? 'Hide numbers' : 'Show numbers'}</button>}
        {waiting > 0 && conn !== 'offline' && <button type="button" onClick={onRetry} style={{ ...S.btnWarn, ...S.btnSm, fontWeight: 700, pointerEvents: sending ? 'none' : 'auto', opacity: sending ? 0.5 : 1 }}>{sending ? 'Sending…' : 'Retry now'}</button>}
      </div>
      {open && waiting > 0 && (
        <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto', fontFamily: T.mono, fontSize: 11, color: T.tx2, borderTop: `1px solid ${T.bd}`, paddingTop: 6 }}>
          {outbox.items.map(it => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
              <span>{it.kind === 'scan' ? it.scan.awb : `undo ${it.awb}`}</span>
              <span style={{ color: T.tx3 }}>{new Date(it.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}{it.attempts > 0 ? ` · ${it.attempts} tr${it.attempts === 1 ? 'y' : 'ies'}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
