// Image Link Check — scans the OFFLINE MASTER SHEET's IMAGE links (active
// products), lists SKUs with dead/empty links, and can AUTO-FIX them: the edge
// function finds the SKU's folder under the tab's Dropbox root (subfolders
// included), creates/reuses a VIEW-ONLY share link, and writes it into the
// sheet cell. Dropbox creds + per-tab roots live in the server vault.
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';
import { supabase, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';

const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';
// The Dropbox app key (a public OAuth client id — the secret stays server-side)
// comes from dropbox_status at runtime, so swapping the Dropbox app in the
// vault never requires a frontend deploy. sharing.write lets the auto-fix
// create view-only share links.
const authUrl = (appKey: string) => `https://www.dropbox.com/oauth2/authorize?client_id=${appKey}&response_type=code&token_access_type=offline&scope=${encodeURIComponent('account_info.read files.metadata.read sharing.read sharing.write')}`;

type Problem = { sku: string; tab: string; row: number; url?: string; problem: string; fixed?: boolean };

// The edge function authorises per action against the CALLER's login (connect
// = admin, fix = operator+, scan = any signed-in user), so send the user's
// session token — the bare anon key is rejected for those actions.
const call = async (body: object) => {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || SUPABASE_ANON_KEY;
  const r = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({} as any)) };
};

export default function MasterLinkCheck({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const { profile } = useAuth();
  const role = profile?.role as string | undefined;
  const canConnect = role === 'admin';
  const canFix = ['admin', 'manager', 'operator'].includes(role || '');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [appKey, setAppKey] = useState('');
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [problems, setProblems] = useState<Problem[] | null>(null);

  useEffect(() => { call({ action: 'dropbox_status' }).then(({ data }) => { setConnected(!!data.connected); setAppKey(data.appKey || ''); }).catch(() => setConnected(false)); }, []);

  const connect = async () => {
    if (connecting || !code.trim()) return;
    setConnecting(true);
    const { data } = await call({ action: 'dropbox_exchange', code: code.trim() });
    setConnecting(false);
    if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Connect failed'), 'error'); return; }
    setConnected(true); setCode('');
    addToast('Dropbox connected', 'success');
  };

  const scan = async () => {
    if (scanning || fixing) return;
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
      addToast(acc.length === 0 ? 'All image links are healthy 🎉' : `${acc.length} problem link${acc.length === 1 ? '' : 's'} found — you can Auto-Fix them`, acc.length === 0 ? 'success' : 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setScanning(false);
  };

  const autoFix = async () => {
    if (fixing || scanning || !problems) return;
    const todo = problems.filter(p => !p.fixed);
    if (todo.length === 0) return;
    setFixing(true); setProgress({ done: 0, total: todo.length });
    let fixedCount = 0;
    try {
      for (let i = 0; i < todo.length; i += 15) {
        const batch = todo.slice(i, i + 15).map(p => ({ sku: p.sku, tab: p.tab, row: p.row }));
        const { data } = await call({ action: 'linkfix', items: batch });
        if (data?.error === 'dropbox_not_connected') { setConnected(false); addToast('Dropbox is not connected — reconnect above', 'error'); break; }
        if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Auto-fix failed'), 'error'); break; }
        for (const r of data.results || []) {
          const idx = problems.findIndex(p => p.tab === r.tab && p.row === r.row);
          if (idx < 0) continue;
          if (r.fixed) { fixedCount++; problems[idx] = { ...problems[idx], fixed: true, url: r.url, problem: 'Fixed — new link inserted in sheet' }; }
          else problems[idx] = { ...problems[idx], problem: r.reason || 'Could not fix' };
        }
        setProblems([...problems]);
        setProgress({ done: Math.min(i + 15, todo.length), total: todo.length });
        if (data.needsReconnect) {
          setConnected(false);
          addToast('Dropbox needs one more permission (sharing.write). Tick it in the Dropbox console, press Submit, then reconnect above.', 'error');
          break;
        }
      }
      addToast(`Auto-fix done — ${fixedCount} link${fixedCount === 1 ? '' : 's'} repaired${fixedCount < todo.length ? `, ${todo.length - fixedCount} need attention` : ''}`, fixedCount > 0 ? 'success' : 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setFixing(false);
  };

  const exportXls = () => {
    if (!problems || problems.length === 0) { addToast('Nothing to export', 'error'); return; }
    const rows = problems.map(p => ({ SKU: p.sku, 'Source Tab': p.tab, 'Sheet Row': p.row, Status: p.problem, Link: p.url || '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Broken Links');
    XLSX.writeFile(wb, `Broken_Image_Links_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const pending = problems ? problems.filter(p => !p.fixed).length : 0;

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      {connected === false && !canConnect && (
        <div style={{ fontSize: 11, color: T.tx3, padding: '10px 0', marginBottom: 8 }}>Dropbox is not connected — ask an admin to connect it (one-time setup).</div>
      )}
      {connected === false && canConnect && (
        <div style={{ background: 'rgba(56,189,248,.05)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10, padding: 14, marginBottom: 12, maxWidth: 560 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.bl, marginBottom: 8 }}>Connect Dropbox (one-time, admin)</div>
          <ol style={{ margin: '0 0 10px 16px', padding: 0, fontSize: 11.5, color: T.tx2, lineHeight: 1.9 }}>
            <li>{appKey ? <a href={authUrl(appKey)} target="_blank" rel="noreferrer" style={{ color: T.bl, fontWeight: 600 }}>Click here to open Dropbox</a> : <span style={{ color: T.tx3 }}>Loading…</span>} and press <b>Allow</b>.</li>
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
        <button onClick={scan} disabled={scanning || fixing || connected !== true} style={{ ...S.btnPrimary, opacity: scanning || fixing || connected !== true ? 0.5 : 1, pointerEvents: scanning || fixing ? 'none' : 'auto' }}>
          {scanning ? `Checking… ${progress.done}/${progress.total || '…'} (${pct}%)` : 'Find Broken Links'}
        </button>
        {pending > 0 && !scanning && canFix && (
          <button onClick={autoFix} disabled={fixing} style={{ ...S.btnSuccessSolid, opacity: fixing ? 0.6 : 1, pointerEvents: fixing ? 'none' : 'auto' }}>
            {fixing ? `Fixing… ${progress.done}/${progress.total}` : `Auto-Fix ${pending} from Dropbox`}
          </button>
        )}
        {problems && problems.length > 0 && <button onClick={exportXls} style={{ ...S.btnGhost, color: T.bl, border: '1px solid rgba(56,189,248,.2)', background: 'rgba(56,189,248,.06)' }}>Export {problems.length}</button>}
        {connected === true && !scanning && problems === null && <span style={{ fontSize: 10, color: T.tx3 }}>Dropbox connected ✓ — checks every active product's image link</span>}
        {connected === true && !scanning && canConnect && <button onClick={() => setConnected(false)} style={{ background: 'none', border: 'none', color: T.tx3, fontSize: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Reconnect</button>}
      </div>

      {(scanning || fixing) && progress.total > 0 && (
        <div style={{ maxWidth: 420, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: fixing ? 'linear-gradient(90deg,#16A34A,#22C55E)' : 'linear-gradient(90deg,#6366F1,#818CF8)', borderRadius: 3, transition: 'width .4s' }} />
        </div>
      )}

      {problems && problems.length === 0 && !scanning && (
        <div style={{ padding: 30, textAlign: 'center', color: T.gr, fontSize: 12 }}>All image links are healthy 🎉</div>
      )}

      {problems && problems.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, border: `1px solid ${T.bd}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead><tr>{['SKU', 'Tab', 'Sheet Row', 'Status', 'Link'].map(c => <th key={c} style={{ ...S.thStyle, whiteSpace: 'nowrap' as const }}>{c}</th>)}</tr></thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={i} style={p.fixed ? { background: 'rgba(34,197,94,.05)' } : undefined}>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{p.sku}</td>
                  <td style={S.tdStyle}>{p.tab}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono }}>{p.row}</td>
                  <td style={{ ...S.tdStyle, color: p.fixed ? T.gr : /empty|deleted|no \//i.test(p.problem) ? T.re : T.yl, fontWeight: 600 }}>{p.fixed ? '✅ ' : ''}{p.problem}</td>
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
