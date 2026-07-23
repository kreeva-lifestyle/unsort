// Image Link Check — scans the OFFLINE MASTER SHEET's IMAGE links (active
// products) and repairs them in TWO steps, per the owner's rule: first "Find
// Correct Links" (dry run — shows exactly which folder/link would be used,
// writes nothing), then "Replace N links" applies only the confirmed matches.
// The server refuses to touch a row when the right folder isn't found or is
// ambiguous (catalog-aware matching). Creds live in the server vault.
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { T, S } from '../../lib/theme';
import { supabase, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { useAuth } from '../../hooks/useAuth';
import ConnectDropboxCard from './ConnectDropboxCard';

const FN = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/odette-export';

type Problem = { sku: string; tab: string; row: number; url?: string; problem: string; fixed?: boolean; willUse?: boolean; folder?: string; approved?: boolean };

// Sensitive actions are authorised per caller role server-side, so send the
// user's session token (the bare anon key is rejected for them).
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
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [problems, setProblems] = useState<Problem[] | null>(null);

  useEffect(() => { call({ action: 'dropbox_status' }).then(({ data }) => { setConnected(!!data.connected); setAppKey(data.appKey || ''); }).catch(() => setConnected(false)); }, []);

  const scan = async () => {
    if (scanning || fixing) return;
    setScanning(true); setProblems(null); setProgress({ done: 0, total: 0 });
    const acc: Problem[] = [];
    try {
      // Belt-and-braces: the server also suppresses approved (sku, url) pairs —
      // filter locally too so a server hiccup can never resurface them.
      const { data: apprRows, error: apprErr } = await supabase.from('link_check_approvals').select('sku, url');
      if (apprErr) addToast(friendlyError(apprErr), 'error');
      const apprSet = new Set((apprRows || []).map(a => `${a.sku}|${a.url}`));
      const notApproved = (b: Problem) => !(b.url && /^WRONG LINK/.test(b.problem) && apprSet.has(`${b.sku}|${b.url}`));
      let offset = 0;
      for (;;) {
        const { status, data } = await call({ action: 'linkcheck', offset, limit: 100 });
        if (data?.error === 'dropbox_not_connected') { setConnected(false); addToast('Dropbox is not connected yet', 'error'); setScanning(false); return; }
        if (!data.ok) { addToast(friendlyError(data.details || data.error || `Link check failed (${status})`), 'error'); break; }
        if (offset === 0) (data.noLink || []).forEach((n: Problem) => acc.push({ ...n, problem: 'No / invalid link in sheet' }));
        acc.push(...(data.broken || []).filter(notApproved));
        (data.warnings || []).forEach((w: string) => addToast(w, 'info'));
        setProblems([...acc].sort((a, b) => a.tab.localeCompare(b.tab) || a.row - b.row));
        setProgress({ done: data.nextOffset ?? data.totalLinks, total: data.totalLinks });
        if (data.nextOffset == null) break;
        offset = data.nextOffset;
      }
      addToast(acc.length === 0 ? 'All image links are healthy 🎉' : `${acc.length} problem link${acc.length === 1 ? '' : 's'} found — press "Find Correct Links" to see the fixes`, acc.length === 0 ? 'success' : 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setScanning(false);
  };

  // Phase 1 (dry=true): find + SHOW the correct folder/link per row, write
  // NOTHING. Phase 2 (dry=false): replace only the rows phase 1 confirmed.
  const runFix = async (dry: boolean) => {
    if (fixing || scanning || !problems) return;
    const todo = problems.filter(p => !p.fixed && (dry || p.willUse));
    if (todo.length === 0) return;
    setFixing(true); setProgress({ done: 0, total: todo.length });
    let good = 0;
    try {
      for (let i = 0; i < todo.length; i += 15) {
        const batch = todo.slice(i, i + 15).map(p => ({ sku: p.sku, tab: p.tab, row: p.row }));
        const { data } = await call({ action: 'linkfix', items: batch, dryRun: dry });
        if (data?.error === 'dropbox_not_connected') { setConnected(false); addToast('Dropbox is not connected — reconnect above', 'error'); break; }
        if (!data.ok) { addToast(friendlyError(data.details || data.error || 'Failed'), 'error'); break; }
        for (const r of data.results || []) {
          const idx = problems.findIndex(p => p.tab === r.tab && p.row === r.row);
          if (idx < 0) continue;
          if (dry) {
            if (r.willUse) { good++; problems[idx] = { ...problems[idx], willUse: true, folder: r.folder, url: r.url || problems[idx].url, problem: `Will replace with ${r.folder}` }; }
            else problems[idx] = { ...problems[idx], willUse: false, problem: r.reason || 'Could not match — not changed' };
          } else if (r.fixed) { good++; problems[idx] = { ...problems[idx], fixed: true, willUse: false, url: r.url, problem: 'Replaced — new link in sheet' }; }
          else problems[idx] = { ...problems[idx], willUse: false, problem: r.reason || 'Could not fix — not changed' };
        }
        setProblems([...problems]);
        setProgress({ done: Math.min(i + 15, todo.length), total: todo.length });
        if (data.needsReconnect) { setConnected(false); addToast('Dropbox needs the sharing.write permission — reconnect above.', 'error'); break; }
      }
      addToast(dry
        ? `${good} correct link${good === 1 ? '' : 's'} found — review the list, then press "Replace ${good}"`
        : `${good} link${good === 1 ? '' : 's'} replaced${good < todo.length ? `, ${todo.length - good} left unchanged` : ''}`,
        good > 0 ? 'success' : 'error');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setFixing(false);
  };

  // "This link IS correct for this SKU" — remember the exact (sku, url) pair
  // so future scans stop flagging it as WRONG LINK. If the sheet's link ever
  // changes, or the target gets deleted/emptied, it flags again.
  const markCorrect = async (p: Problem, undo: boolean) => {
    if (!p.url) return;
    const { error } = undo
      ? await supabase.from('link_check_approvals').delete().match({ sku: p.sku, url: p.url })
      : await supabase.from('link_check_approvals').insert({ sku: p.sku, url: p.url, tab: p.tab, approved_by: (await supabase.auth.getUser()).data.user?.id });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setProblems(prev => prev ? prev.map(q => q.tab === p.tab && q.row === p.row ? { ...q, approved: !undo, problem: undo ? q.problem.replace(/^✓.*$/, 'WRONG LINK — re-check on next scan') : `✓ Marked correct — won't be flagged again` } : q) : prev);
    addToast(undo ? `${p.sku} will be checked again on the next scan` : `${p.sku} remembered as correct`, 'success');
  };

  const exportXls = () => {
    if (!problems || problems.length === 0) { addToast('Nothing to export', 'error'); return; }
    const rows = problems.map(p => ({ SKU: p.sku, 'Source Tab': p.tab, 'Sheet Row': p.row, Status: p.problem, 'Matched Folder': p.folder || '', Link: p.url || '' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Broken Links');
    XLSX.writeFile(wb, `Broken_Image_Links_${new Date().toISOString().slice(0, 10)}.xls`);
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const pending = problems ? problems.filter(p => !p.fixed).length : 0;
  const replaceable = problems ? problems.filter(p => p.willUse && !p.fixed).length : 0;
  const statusColor = (p: Problem) => p.fixed || p.approved ? T.gr : p.willUse ? T.gr : /empty|deleted|wrong|no \//i.test(p.problem) ? T.re : T.yl;

  return (
    <div style={{ animation: 'fi .15s ease' }}>
      {connected === false && !canConnect && (
        <div style={{ fontSize: 11, color: T.tx3, padding: '10px 0', marginBottom: 8 }}>Dropbox is not connected — ask an admin to connect it (one-time setup).</div>
      )}
      {connected === false && canConnect && (
        <ConnectDropboxCard appKey={appKey} call={call} addToast={addToast} onConnected={() => setConnected(true)} />
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={scan} disabled={scanning || fixing || connected !== true} style={{ ...S.btnPrimary, opacity: scanning || fixing || connected !== true ? 0.5 : 1, pointerEvents: scanning || fixing ? 'none' : 'auto' }}>
          {scanning ? `Checking… ${progress.done}/${progress.total || '…'} (${pct}%)` : 'Find Broken Links'}
        </button>
        {pending > 0 && !scanning && canFix && (
          <button onClick={() => runFix(true)} disabled={fixing} style={{ ...S.btnGhost, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .25)', background: 'oklch(0.72 0.19 145 / .06)', opacity: fixing ? 0.6 : 1, pointerEvents: fixing ? 'none' : 'auto' }}>
            {fixing ? `Working… ${progress.done}/${progress.total}` : `Find Correct Links (${pending})`}
          </button>
        )}
        {replaceable > 0 && !scanning && !fixing && canFix && (
          <button onClick={() => runFix(false)} style={S.btnSuccessSolid}>Replace {replaceable} link{replaceable === 1 ? '' : 's'}</button>
        )}
        {problems && problems.length > 0 && <button onClick={exportXls} style={{ ...S.btnGhost, color: T.bl, border: '1px solid oklch(0.77 0.14 230 / .2)', background: 'oklch(0.77 0.14 230 / .06)' }}>Export {problems.length}</button>}
        {connected === true && !scanning && problems === null && <span style={{ fontSize: 10, color: T.tx3 }}>Dropbox connected ✓ — checks dead, empty and WRONG links on every active product</span>}
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
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr>{['SKU', 'Tab', 'Sheet Row', 'Status', 'Link'].map(c => <th key={c} style={{ ...S.thStyle, whiteSpace: 'nowrap' as const }}>{c}</th>)}</tr></thead>
            <tbody>
              {problems.map((p, i) => (
                <tr key={i} style={p.fixed ? { background: 'oklch(0.72 0.19 145 / .05)' } : undefined}>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{p.sku}</td>
                  <td style={S.tdStyle}>{p.tab}</td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono }}>{p.row}</td>
                  <td style={{ ...S.tdStyle, color: statusColor(p), fontWeight: 600 }}>
                    {p.fixed ? '✅ ' : p.willUse ? '🟢 ' : ''}{p.problem}
                    {canFix && p.url && !p.fixed && /^WRONG LINK/.test(p.problem) && !p.approved && (
                      <button onClick={() => markCorrect(p, false)} title="This link IS correct for this SKU — stop flagging it" style={{ ...S.btnGhost, display: 'block', marginTop: 5, padding: '3px 9px', fontSize: 10, color: T.gr, border: '1px solid oklch(0.72 0.19 145 / .3)', background: 'oklch(0.72 0.19 145 / .06)' }}>Correct ✓ — don't show again</button>
                    )}
                    {p.approved && (
                      <button onClick={() => markCorrect(p, true)} style={{ background: 'none', border: 'none', color: T.tx3, fontSize: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0, display: 'block', marginTop: 4 }}>Undo</button>
                    )}
                  </td>
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
