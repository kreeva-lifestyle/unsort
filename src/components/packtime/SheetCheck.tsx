// Scan History → "Check sheet" (admins / managers): one day's scans in the
// app against the Google Sheet, courier by courier, with the numbers the
// sheet is missing listed and queued again for the server to append. The
// same check runs by itself every evening (20:35 IST) and notifies admins
// and managers of any mismatch.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { useModalLock } from '../../hooks/useModalLock';
import { callEdge } from './edge';

interface Check { sheet: string; courier: string; inApp: number; inSheet: number; missing: string[]; extra: string[]; requeued: number; error?: string }

export default function SheetCheck({ day, addToast }: { day: string; addToast: (m: string, t?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ day: string; sheets: Check[] } | null>(null);
  useModalLock(!!result);

  const run = async () => {
    setBusy(true);
    const r = await callEdge({ action: 'verify', day, repair: true }, 60000);
    setBusy(false);
    if (!r?.ok) { addToast(r?.details || r?.error || 'The sheet check failed', 'error'); return; }
    setResult({ day: r.day, sheets: r.sheets || [] });
  };
  const dayText = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <>
      <button type="button" onClick={run} disabled={busy || !day} title="Compare this day's scans with the Google Sheet; anything missing is queued again" style={{ ...S.btnGhost, minHeight: 44, opacity: busy || !day ? 0.4 : 1, pointerEvents: busy || !day ? 'none' : 'auto' }}>{busy ? 'Checking…' : 'Check sheet'}</button>
      {result && createPortal(
        <div style={S.modalOverlay} onClick={() => setResult(null)}>
          <div className="modal-inner" style={{ ...S.modalBox, width: 520 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Sheet check · {dayText(result.day)}</span>
              <button type="button" onClick={() => setResult(null)} style={S.modalClose} aria-label="Close">&#215;</button>
            </div>
            <div style={{ padding: '14px 18px', overflowY: 'auto', maxHeight: '70vh' }}>
              {result.sheets.map(c => {
                const ok = !c.error && c.missing.length === 0 && c.extra.length === 0;
                const color = c.error ? T.re : ok ? T.gr : T.yl;
                return (
                  <div key={c.sheet} style={{ padding: '10px 0', borderBottom: `1px solid ${T.bd}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{c.courier}</span>
                      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{c.error ? 'check failed' : ok ? 'matches' : `${c.missing.length ? `${c.missing.length} not in sheet` : ''}${c.missing.length && c.extra.length ? ' · ' : ''}${c.extra.length ? `${c.extra.length} in sheet only` : ''}`}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>{c.inApp} in app · {c.inSheet} in sheet that day</div>
                    {c.error && <div style={{ fontSize: 11, color: T.re, marginTop: 4 }}>{c.error}</div>}
                    {c.missing.length > 0 && <div style={{ fontSize: 11, color: T.tx2, marginTop: 4, fontFamily: T.mono, wordBreak: 'break-all' }}>Missing: {c.missing.join(', ')}{c.requeued ? <span style={{ color: T.gr, fontFamily: T.sans }}> — queued again, in the sheet within a minute</span> : null}</div>}
                    {c.extra.length > 0 && <div style={{ fontSize: 11, color: T.tx2, marginTop: 4, fontFamily: T.mono, wordBreak: 'break-all' }}>In sheet only: {c.extra.join(', ')}</div>}
                  </div>
                );
              })}
              {result.sheets.length === 0 && <div style={{ fontSize: 12, color: T.tx3 }}>No active couriers.</div>}
            </div>
            <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setResult(null)} style={{ ...S.btnGhost, minHeight: 44 }}>Close</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
