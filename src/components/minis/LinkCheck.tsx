// Image Link Check — scans the OFFLINE MASTER SHEET's IMAGE links (active
// products) and lists the SKUs whose Dropbox links are deleted, empty, or
// unreachable, with the exact sheet row to fix. Dropbox links are verified via
// the Dropbox API (one-time "Connect Dropbox" stores a refresh token in the
// server vault); everything runs in the odette-export edge function.
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';
import { SUPABASE_ANON_KEY } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';

const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';
// The app key is a public OAuth client id (the secret stays server-side).
const DROPBOX_APP_KEY = 'g09clfz7dgze0re';
const AUTH_URL = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=code&token_access_type=offline&scope=${encodeURIComponent('account_info.read files.metadata.read sharing.read')}`;

type Problem = { sku: string; tab: string; row: number; url?: string; problem: string };

const call = async (body: object) => {
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({} as any)) };
};

export default function MasterLinkCheck({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [problems, setProblems] = useState<Problem[] | null>(null);

  useEffect(() => { call({ action: 'dropbox_status' }).then(({ data }) => setConnected(!!data.connected)).catch(() => setConnected(false)); }, []);

  const connect = async () => {
    if (connecting || !code.trim()) return;
    setConnecting(true);
    const { data } = await call({ action: 'dropbox_exchange', code: code.trim() });
    setConnecting(false);
    if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Connect failed'), 'error'); return; }
    setConnected(true); setCode('');
    addToast('Dropbox connected — you can now check links anytime', 'success');
  };

  const scan = async () => {
    if (scanning) return;
    setScanning(true); setProblems(null); setProgress({ done: 0, total: 0 });
    const acc: Problem[] = [];
    try {
      let offset = 0;
      for (;;) {
        const { status, data } = await call({ action: 'linkcheck', offset, limit: 100 });
        if (data?.error === 'dropbox_not_connected') { setConnected(false); addToast('Dropbox is not connected yet — follow the connect step above', 'error'); setScanning(false); return; }
        if (!data.ok) { addToast(friendlyError(data.details || data.error || `Link check failed (${status})`), 'error'); break; }
        if (offset === 0) (data.noLink || []).forEach((n: Problem) => acc.push({ ...n, problem: 'No / invalid link in sheet' }));
        acc.push(...(data.broken || []));
        (data.warnings || []).forEach((w: string) => addToast(w, 'info'));
        setProblems([...acc].sort((a, b) => a.tab.localeCompare(b.tab) || a.row - b.row));
        const done = data.nextOffset ?? data.totalLinks;
        setProgress({ done, total: data.totalLinks });
        if (data.nextOffset == null) break;
        offset = data.nextOffset;
      }
      addToast(acc.length === 0 ? 'All image links are healthy 🎉' : `${acc.length} problem link${acc.length === 1 ? '' : 's'} found — see the list`, acc.length === 0 ? 'success' : 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setScanning(false);
  };

  const exportXls = () => {
    if (!problems || problems.length === 0) { addToast('Nothing to export', 'error'); return; }
    const rows = problems.map(p => ({ SKU: p.sku, 'Source Tab': p.tab, 'Sheet Row': p.row, Problem: p.problem, Link: p.url || '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Broken Links');
    XLSX.writeFile(wb, `Broken_Image_Links_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      {connected === false && (
        <div style={{ background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10, padding: 14, marginBottom: 12, maxWidth: 560 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.bl, marginBottom: 8 }}>One-time setup — connect Dropbox</div>
          <ol style={{ margin: '0 0 10px 16px', padding: 0, fontSize: 11.5, color: T.tx2, lineHeight: 1.9 }}>
            <li><a href={AUTH_URL} target="_blank" rel="noreferrer" style={{ color: T.bl, fontWeight: 600 }}>Click here to open Dropbox</a> and press <b>Allow</b>.</li>
            <li>Dropbox will show an <b>access code</b> — copy it.</li>
            <li>Paste the code below and press Connect.</li>
          </ol>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Paste the Dropbox code here" style={{ ...S.fInput, flex: 1, fontFamily: T.mono }} onKeyDown={e => { if (e.key === 'Enter') connect(); }} />
            <button onClick={connect} disabled={connecting || !code.trim()} style={{ ...S.btnPrimary, pointerEvents: connecting ? 'none' : 'auto', opacity: connecting || !code.trim() ? 0.5 : 1 }}>{connecting ? 'Connecting…' : 'Connect'}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={scan} disabled={scanning || connected !== true} style={{ ...S.btnPrimary, opacity: scanning || connected !== true ? 0.5 : 1, pointerEvents: scanning ? 'none' : 'auto' }}>
          {scanning ? `Checking… ${progress.done}/${progress.total || '…'} (${pct}%)` : 'Find Broken Links'}
        </button>
        {problems && problems.length > 0 && <button onClick={exportXls} style={{ ...S.btnGhost, color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)' }}>Export {problems.length}</button>}
        {connected === true && !scanning && problems === null && <span style={{ fontSize: 10, color: T.tx3 }}>Dropbox connected ✓ — checks every active product's image link</span>}
      </div>

      {scanning && progress.total > 0 && (
        <div style={{ maxWidth: 420, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#6366F1,#818CF8)', borderRadius: 3, transition: 'width .4s' }} />
        </div>
      )}

      {problems && problems.length === 0 && !scanning && (
        <div style={{ padding: 30, textAlign: 'center', color: T.gr, fontSize: 12 }}>All image links are healthy 🎉</div>
      )}

      {problems && problems.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead><tr>{['SKU', 'Tab', 'Sheet Row', 'Problem', 'Link'].map(c => <th key={c} style={{ ...S.thStyle, whiteSpace: 'nowrap' as const }}>{c}</th>)}</tr></thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={i}>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{p.sku}</td>
                  <td style={S.tdStyle}>{p.tab}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono }}>{p.row}</td>
                  <td style={{ ...S.tdStyle, color: /empty|deleted|no \//i.test(p.problem) ? T.re : T.yl, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{p.problem}</td>
                  <td style={S.tdStyle}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ color: T.bl }}>Open</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
