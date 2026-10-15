// Client Finder → Buyers: give it one buyer's website and it finds lookalike
// buyers anywhere, then lookalikes of those (up to 3 hops). The edge function
// `buyer-spider` does the reading and the judging; this panel starts, steps,
// pauses and resumes a run, and shows the buyers as they land.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { T, S } from '../../../../lib/theme';
import { friendlyError } from '../../../../lib/friendlyError';
import { useAuth } from '../../../../hooks/useAuth';
import { call, explain, RUN_COLS, type BuyerRun, type SearchUsage, type SpiderStatus } from './buyerApi';
import { useSpiderLoop } from './useSpiderLoop';
import BuyerKeyCard from './BuyerKeyCard';
import BuyerLeadList from './BuyerLeadList';

const RESULT_TEXT: Record<string, string> = { searched: 'searched', lead: 'buyer ✓', rejected: 'not a buyer', unreachable: 'could not read', failed: 'failed' };

export default function BuyerSpider({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [status, setStatus] = useState<SpiderStatus | null>(null);
  const [usage, setUsage] = useState<SearchUsage | null>(null);
  const [run, setRun] = useState<BuyerRun | null>(null);
  const [seed, setSeed] = useState('');
  const [depth, setDepth] = useState(2);
  const [maxLeads, setMaxLeads] = useState(150);
  const [starting, setStarting] = useState(false);
  const [controlling, setControlling] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const { status: st, data } = await call({ action: 'status' });
      if (data.ok) {
        setStatus({ hasSearchKey: !!data.hasSearchKey, hasAiKey: !!data.hasAiKey, model: String(data.model || ''), role: String(data.role || ''), caps: data.caps! });
        if (data.search_usage) setUsage(data.search_usage);
      } else setError(explain(data, st));
    } catch (e) { setError(friendlyError(e)); }
  }, []);
  // The newest of YOUR runs comes back on every open, so a run paused from
  // the phone can be resumed from the desk (the queue lives in the database).
  // A run left 'running' by a closed tab is shown paused and waits for an
  // explicit Resume here: opening the panel must never start stepping, or two
  // tabs (or two people) would step the same queue in parallel.
  useEffect(() => {
    loadStatus();
    if (!profile?.id) return;
    supabase.from('buyer_runs').select(RUN_COLS).eq('created_by', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data, error: e }) => {
        if (e) { addToast(friendlyError(e), 'error'); return; }
        if (!data) return;
        const r = data as BuyerRun;
        setRun(r.status === 'running' ? { ...r, status: 'paused', step_note: 'Paused — tap Resume to continue' } : r);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const onLoopError = useCallback((m: string) => { setError(m); addToast(m, 'error'); }, [addToast]);
  // Brave's free plan is 1,000 searches a month: the server stops at the cap;
  // this warns once per open when usage crosses the warning line (900).
  const warned = useRef(false);
  const onUsage = useCallback((u: SearchUsage) => {
    setUsage(u);
    if (u.used >= u.warn_at && u.used < u.cap && !warned.current) {
      warned.current = true;
      addToast(`${u.used} of ${u.cap} free Brave searches used this month — ${u.cap - u.used} left`, 'error');
    }
  }, [addToast]);
  const { log, stepping, clearLog } = useSpiderLoop(run, setRun, onLoopError, onUsage);

  const start = async () => {
    if (starting) return;
    if (!seed.trim()) { setError('Enter a buyer\'s website first'); return; }
    setStarting(true); setError(''); clearLog();
    try {
      const { status: st, data } = await call({ action: 'start', seed_url: seed.trim(), max_depth: depth, max_leads: maxLeads });
      if (!data.ok || !data.run) { setError(explain(data, st)); addToast(explain(data, st), 'error'); return; }
      setRun(data.run); setSeed('');
      if (data.search_usage) setUsage(data.search_usage);
      addToast(`Profiled ${data.run.profile.business_name || data.run.seed_domain} — searching`, 'success');
    } catch (e) { const m = friendlyError(e); setError(m); addToast(m, 'error'); }
    finally { setStarting(false); }
  };
  const control = async (action: 'pause' | 'resume'): Promise<boolean> => {
    if (!run || controlling) return false;
    setControlling(true);
    try {
      const { status: st, data } = await call({ action, run_id: run.id });
      if (!data.ok) { addToast(explain(data, st), 'error'); return false; }
      setError('');
      setRun(data.run ?? { ...run, status: action === 'pause' ? 'paused' : 'running', last_error: null, step_note: action === 'pause' ? 'Paused' : 'Resumed' });
      addToast(action === 'pause' ? 'Paused' : 'Resumed', 'success');
      return true;
    } catch (e) { addToast(friendlyError(e), 'error'); return false; }
    finally { setControlling(false); }
  };
  const busyStyle = { pointerEvents: controlling ? 'none' as const : 'auto' as const, opacity: controlling ? 0.5 : 1 };

  const capReached = !!usage && usage.used >= usage.cap;
  const nearCap = !!usage && !capReached && usage.used >= usage.warn_at;
  const ready = !!status?.hasSearchKey && !!status?.hasAiKey && !capReached;
  const live = run && (run.status === 'running' || run.status === 'paused');
  const p = run?.profile;
  const pct = run ? Math.min(100, Math.round((run.leads_found / run.max_leads) * 100)) : 0;

  return (
    <div>
      <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
        Paste the website of a buyer you already have (a boutique, a reseller, an online store). The spider reads it, searches the web for shops like it anywhere in the world, reads each one, keeps the real buyers with their contact details, and lets every buyer it finds lead to more. It never logs in anywhere, reads one page per site, and never makes more than 1,000 Brave searches in a month.
      </div>
      <BuyerKeyCard hasKey={!!status?.hasSearchKey} isAdmin={isAdmin} onSaved={loadStatus} addToast={addToast} />
      {usage && (
        <div style={{ fontSize: 11, color: capReached ? T.re : nearCap ? T.yl : T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
          {usage.used} of {usage.cap} free Brave searches used this month{capReached ? ' — the limit is reached; runs continue next month.' : nearCap ? ` — only ${usage.cap - usage.used} left; a full run uses up to ${status?.caps.queriesPerRun ?? 120}.` : '.'}
        </div>
      )}
      {status && !status.hasAiKey && <div style={{ fontSize: 11, color: T.yl, marginBottom: 10 }}>No Anthropic API key — an admin can add one in Settings → Listing AI. The spider needs it to judge sites.</div>}

      {!live && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={S.fLabel}>Buyer's website</div>
            <input value={seed} onChange={e => setSeed(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') start(); }} placeholder="www.theirshop.com" inputMode="url" autoCapitalize="none" style={{ ...S.fInput, width: '100%' }} />
          </div>
          <div>
            <div style={S.fLabel}>Hops</div>
            <select value={depth} onChange={e => setDepth(Number(e.target.value))} style={{ ...S.fInput, width: 'auto' }}>
              <option value={1}>1 · lookalikes only</option><option value={2}>2 · and their lookalikes</option><option value={3}>3 · deep</option>
            </select>
          </div>
          <div>
            <div style={S.fLabel}>Stop at</div>
            <select value={maxLeads} onChange={e => setMaxLeads(Number(e.target.value))} style={{ ...S.fInput, width: 'auto' }}>
              {[50, 100, 150, 300, 500].map(n => <option key={n} value={n}>{n} buyers</option>)}
            </select>
          </div>
          <button onClick={start} disabled={starting || !ready} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: starting ? 'none' : 'auto', opacity: starting || !ready ? 0.5 : 1 }}>{starting ? 'Reading the site…' : 'Find buyers'}</button>
        </div>
      )}

      {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{error}</div>}

      {run && (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: run.status === 'running' ? T.gr : run.status === 'paused' ? T.yl : run.status === 'failed' ? T.re : T.tx3, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, flex: 1, minWidth: 160 }}>{p?.business_name || run.seed_domain} <span style={{ fontSize: 10.5, color: T.tx3, fontWeight: 400 }}>· {run.status}{stepping ? '…' : ''}</span></span>
            {run.status === 'running' && <button onClick={() => control('pause')} style={{ ...S.btnGhost, minHeight: 44, ...busyStyle }}>{controlling ? 'Pausing…' : 'Pause'}</button>}
            {run.status === 'paused' && <button onClick={() => control('resume')} style={{ ...S.btnPrimary, minHeight: 44, ...busyStyle }}>{controlling ? 'Resuming…' : 'Resume'}</button>}
            {/* Always pauses the server row: the card may read paused while the
                database still says running (a run loaded from another tab). */}
            {live && <button onClick={async () => { if (await control('pause')) setRun(null); }} style={{ ...S.btnGhost, minHeight: 44, ...busyStyle }}>New run</button>}
            {!live && <button onClick={() => setRun(null)} style={{ ...S.btnGhost, minHeight: 44 }}>Clear</button>}
          </div>
          {p && <div style={{ fontSize: 11, color: T.tx2, marginTop: 6, lineHeight: 1.5 }}>{p.what_they_sell}{p.customer ? ` — for ${p.customer}` : ''}{[p.city, p.country].filter(Boolean).length ? ` · ${[p.city, p.country].filter(Boolean).join(', ')}` : ''}{!p.is_buyer && <span style={{ color: T.yl }}> · reads as a manufacturer, not a buyer</span>}</div>}
          <div style={{ height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, margin: '10px 0 6px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${T.ac}, ${T.ac2})`, transition: 'width .4s' }} /></div>
          <div style={{ fontSize: 10.5, color: T.tx3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><b style={{ color: T.tx2 }}>{run.leads_found}</b> of {run.max_leads} buyers</span>
            <span>{run.pages_fetched} sites read</span>
            <span>{run.queries_used}{status ? ` of ${status.caps.queriesPerRun}` : ''} searches</span>
            <span>{run.max_depth} hop{run.max_depth === 1 ? '' : 's'}</span>
          </div>
          {run.step_note && <div style={{ fontSize: 11, color: T.tx2, marginTop: 6 }}>{run.step_note}</div>}
          {log.length > 0 && (
            <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 10, color: T.tx3, lineHeight: 1.7 }}>
              {log.map((it, i) => <div key={i} style={{ color: it.result === 'lead' ? T.gr : T.tx3 }}>hop {it.hop} · {it.domain} · {RESULT_TEXT[it.result]}{it.score !== undefined ? ` (${it.score})` : ''}{it.added ? ` · +${it.added} to check` : ''}</div>)}
            </div>
          )}
        </div>
      )}

      <BuyerLeadList runId={run?.id ?? null} refreshKey={run?.leads_found ?? 0} addToast={addToast} />
    </div>
  );
}
