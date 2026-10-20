// Client Finder → Buyers: give it one buyer's website and it finds lookalike
// buyers anywhere, then lookalikes of those (up to 4 hops). The edge function
// `buyer-spider` does the reading and the judging; this panel starts runs
// (several can go at once — each BuyerRunCard steps its own) and shows the
// buyers as they land.
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { supabase } from '../../../../lib/supabase';
import { T, S } from '../../../../lib/theme';
import { friendlyError } from '../../../../lib/friendlyError';
import { useAuth } from '../../../../hooks/useAuth';
import { call, explain, RUN_COLS, type BuyerRun, type SearchUsage, type SpiderStatus } from './buyerApi';
import BuyerKeyCard from './BuyerKeyCard';
import BuyerLeadList from './BuyerLeadList';
import BuyerRunCard from './BuyerRunCard';

const SHOW_DONE_MS = 24 * 3600_000;   // finished runs stay on screen for a day (Clear hides one sooner)

export default function BuyerSpider({ addToast }: { addToast: (m: string, t?: string) => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [status, setStatus] = useState<SpiderStatus | null>(null);
  const [usage, setUsage] = useState<SearchUsage | null>(null);
  const [runs, setRuns] = useState<BuyerRun[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [seed, setSeed] = useState('');
  const [depth, setDepth] = useState(3);
  const [maxLeads, setMaxLeads] = useState(150);
  const [starting, setStarting] = useState(false);
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
  // YOUR unfinished runs (and those finished in the last day) come back on
  // every open, so a run paused from the phone can be resumed from the desk
  // (the queue lives in the database). A run left 'running' by a closed tab is
  // shown paused and waits for an explicit Resume here: opening the panel must
  // never start stepping, or two tabs (or two people) would step the same
  // queue in parallel.
  useEffect(() => {
    loadStatus();
    if (!profile?.id) return;
    supabase.from('buyer_runs').select(RUN_COLS).eq('created_by', profile.id).order('created_at', { ascending: false }).limit(10)
      .then(({ data, error: e }) => {
        if (e) { addToast(friendlyError(e), 'error'); return; }
        const cutoff = Date.now() - SHOW_DONE_MS;
        const shown = ((data ?? []) as BuyerRun[])
          .filter(r => r.status === 'running' || r.status === 'paused' || new Date(r.updated_at).getTime() >= cutoff)
          .map(r => (r.status === 'running' ? { ...r, status: 'paused' as const, step_note: 'Paused — tap Resume to continue' } : r));
        setRuns(shown);
        setSelected(s => s ?? shown[0]?.id ?? null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const updateRun = useCallback((id: string, u: SetStateAction<BuyerRun | null>) => {
    setRuns(rs => rs.map(r => (r.id === id ? (typeof u === 'function' ? u(r) : u) ?? r : r)));
  }, []);
  const removeRun = useCallback((id: string) => {
    setRuns(rs => rs.filter(r => r.id !== id));
    setSelected(s => (s === id ? null : s));
  }, []);
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

  const start = async () => {
    if (starting) return;
    if (!seed.trim()) { setError('Enter a buyer\'s website first'); return; }
    setStarting(true); setError('');
    try {
      const { status: st, data } = await call({ action: 'start', seed_url: seed.trim(), max_depth: depth, max_leads: maxLeads });
      if (data.search_usage) setUsage(data.search_usage);
      if (!data.ok || !data.run) { setError(explain(data, st)); addToast(explain(data, st), 'error'); return; }
      const fresh = data.run;
      setRuns(rs => [fresh, ...rs.filter(r => r.id !== fresh.id)]); setSelected(fresh.id); setSeed('');
      addToast(`Profiled ${data.run.profile.business_name || data.run.seed_domain} — searching`, 'success');
    } catch (e) { const m = friendlyError(e); setError(m); addToast(m, 'error'); }
    finally { setStarting(false); }
  };
  const capReached = !!usage && usage.used >= usage.cap;
  const nearCap = !!usage && !capReached && usage.used >= usage.warn_at;
  const ready = !!status?.hasSearchKey && !!status?.hasAiKey && !capReached;
  const going = runs.filter(r => r.status === 'running').length;
  const maxActive = status?.caps.activeRuns ?? 3;

  return (
    <div>
      <div style={{ fontSize: 11, color: T.tx3, lineHeight: 1.6, marginBottom: 12 }}>
        Paste the website of a buyer you already have (a boutique, a reseller, an online store). The spider reads it, searches the web for shops like it anywhere in the world, reads each one, keeps the real buyers with their contact details, and lets every buyer it finds lead to more. A business already on your buyer list is never suggested again, even under another web address. Several runs can go at once. It never logs in anywhere, reads one page per site, and never makes more than 1,000 Brave searches in a month.
      </div>
      <BuyerKeyCard hasKey={!!status?.hasSearchKey} isAdmin={isAdmin} onSaved={loadStatus} addToast={addToast} />
      {usage && (
        <div style={{ fontSize: 11, color: capReached ? T.re : nearCap ? T.yl : T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
          {usage.used} of {usage.cap} free Brave searches used this month{capReached ? ' — the limit is reached; runs continue next month.' : nearCap ? ` — only ${usage.cap - usage.used} left; a full run uses up to ${status?.caps.queriesPerRun ?? 150}.` : '.'}
        </div>
      )}
      {status && !status.hasAiKey && <div style={{ fontSize: 11, color: T.yl, marginBottom: 10 }}>No Anthropic API key — an admin can add one in Settings → Listing AI. The spider needs it to judge sites.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={S.fLabel}>Buyer's website</div>
          <input value={seed} onChange={e => setSeed(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') start(); }} placeholder="www.theirshop.com" inputMode="url" autoCapitalize="none" style={{ ...S.fInput, width: '100%' }} />
        </div>
        <div>
          <div style={S.fLabel}>Hops</div>
          <select value={depth} onChange={e => setDepth(Number(e.target.value))} style={{ ...S.fInput, width: 'auto' }}>
            <option value={1}>1 · lookalikes only</option><option value={2}>2 · and their lookalikes</option><option value={3}>3 · deep</option><option value={4}>4 · deepest</option>
          </select>
        </div>
        <div>
          <div style={S.fLabel}>Stop at</div>
          <select value={maxLeads} onChange={e => setMaxLeads(Number(e.target.value))} style={{ ...S.fInput, width: 'auto' }}>
            {[50, 100, 150, 300, 500].map(n => <option key={n} value={n}>{n} buyers</option>)}
          </select>
        </div>
        <button onClick={start} disabled={starting || !ready} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: starting ? 'none' : 'auto', opacity: starting || !ready ? 0.5 : 1 }}>{starting ? 'Reading the site…' : runs.some(r => r.status === 'running' || r.status === 'paused') ? 'Start another run' : 'Find buyers'}</button>
      </div>
      {going > 1 && <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10 }}>{going} runs going at once (up to {maxActive}). Businesses already on your buyer list are skipped, whatever their web address.</div>}

      {error && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{error}</div>}

      {runs.map(r => (
        <BuyerRunCard key={r.id} run={r} selected={selected === r.id} queriesPerRun={status?.caps.queriesPerRun} onChange={updateRun} onSelect={setSelected} onRemove={removeRun} onUsage={onUsage} addToast={addToast} />
      ))}

      <BuyerLeadList runId={selected} refreshKey={runs.reduce((n, r) => n + r.leads_found, 0)} addToast={addToast} />
    </div>
  );
}
