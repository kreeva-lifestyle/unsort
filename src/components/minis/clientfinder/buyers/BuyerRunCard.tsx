// One Buyer Spider run: its progress, live log and controls. Each card drives
// its own run (useSpiderLoop), so several runs can go at the same time; the
// server caps how many one person has going (MAX_ACTIVE_RUNS in buyer-spider).
import { useCallback, useState, type SetStateAction } from 'react';
import { T, S } from '../../../../lib/theme';
import { friendlyError } from '../../../../lib/friendlyError';
import { call, explain, type BuyerRun, type SearchUsage } from './buyerApi';
import { useSpiderLoop } from './useSpiderLoop';

const RESULT_TEXT: Record<string, string> = { searched: 'searched', lead: 'buyer ✓', rejected: 'not a buyer', unreachable: 'could not read', failed: 'failed', known: 'already on your list' };
type Action = 'pause' | 'resume' | 'stop';
const DONE_TEXT: Record<Action, string> = { pause: 'Paused', resume: 'Resumed', stop: 'Stopped — its buyers stay on the list' };
const BUSY_TEXT: Record<Action, string> = { pause: 'Pausing…', resume: 'Resuming…', stop: 'Stopping…' };

interface Props {
  run: BuyerRun;
  selected: boolean;
  queriesPerRun?: number;
  onChange: (id: string, u: SetStateAction<BuyerRun | null>) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUsage: (u: SearchUsage) => void;
  addToast: (m: string, t?: string) => void;
}

export default function BuyerRunCard({ run, selected, queriesPerRun, onChange, onSelect, onRemove, onUsage, addToast }: Props) {
  const [controlling, setControlling] = useState<Action | ''>('');
  const [error, setError] = useState('');
  const setRun = useCallback((u: SetStateAction<BuyerRun | null>) => onChange(run.id, u), [onChange, run.id]);
  const onError = useCallback((m: string) => { setError(m); addToast(m, 'error'); }, [addToast]);
  const { log, stepping } = useSpiderLoop(run, setRun, onError, onUsage);

  const control = async (action: Action) => {
    if (controlling) return;
    setControlling(action);
    try {
      const { status: st, data } = await call({ action, run_id: run.id });
      if (data.search_usage) onUsage(data.search_usage);
      if (!data.ok) { addToast(explain(data, st), 'error'); return; }
      setError('');
      onChange(run.id, data.run ?? { ...run, status: action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'done', last_error: null, step_note: DONE_TEXT[action] });
      addToast(DONE_TEXT[action], 'success');
    } catch (e) { addToast(friendlyError(e), 'error'); }
    finally { setControlling(''); }
  };
  const btn = (action: Action, label: string, primary = false) => (
    <button onClick={e => { e.stopPropagation(); control(action); }} style={{ ...(primary ? S.btnPrimary : S.btnGhost), minHeight: 44, pointerEvents: controlling ? 'none' : 'auto', opacity: controlling ? 0.5 : 1 }}>{controlling === action ? BUSY_TEXT[action] : label}</button>
  );

  const p = run.profile;
  const live = run.status === 'running' || run.status === 'paused';
  const pct = Math.min(100, Math.round((run.leads_found / run.max_leads) * 100));
  const dot = run.status === 'running' ? T.gr : run.status === 'paused' ? T.yl : run.status === 'failed' ? T.re : T.tx3;

  return (
    <div onClick={() => onSelect(run.id)} style={{ background: selected ? T.ac3 : 'rgba(255,255,255,0.02)', border: `1px solid ${selected ? T.ac44 : T.bd}`, borderRadius: 10, padding: 14, marginBottom: 10, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: T.tx, flex: 1, minWidth: 160 }}>{p?.business_name || run.seed_domain} <span style={{ fontSize: 10.5, color: T.tx3, fontWeight: 400 }}>· {run.status}{stepping ? '…' : ''}</span></span>
        {run.status === 'running' && btn('pause', 'Pause')}
        {run.status === 'paused' && btn('resume', 'Resume', true)}
        {/* Stop always goes to the server: the card may read paused while the
            database still says running (a run loaded from another tab). */}
        {live && run.status !== 'running' && btn('stop', 'Stop')}
        {!live && <button onClick={e => { e.stopPropagation(); onRemove(run.id); }} style={{ ...S.btnGhost, minHeight: 44 }}>Clear</button>}
      </div>
      {p && <div style={{ fontSize: 11, color: T.tx2, marginTop: 6, lineHeight: 1.5 }}>{p.what_they_sell}{p.customer ? ` — for ${p.customer}` : ''}{[p.city, p.country].filter(Boolean).length ? ` · ${[p.city, p.country].filter(Boolean).join(', ')}` : ''}{!p.is_buyer && <span style={{ color: T.yl }}> · reads as a manufacturer, not a buyer</span>}</div>}
      <div style={{ height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 3, margin: '10px 0 6px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${T.ac}, ${T.ac2})`, transition: 'width .4s' }} /></div>
      <div style={{ fontSize: 10.5, color: T.tx3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span><b style={{ color: T.tx2 }}>{run.leads_found}</b> of {run.max_leads} buyers</span>
        <span>{run.pages_fetched} sites read</span>
        <span>{run.queries_used}{queriesPerRun ? ` of ${queriesPerRun}` : ''} searches</span>
        <span>{run.max_depth} hop{run.max_depth === 1 ? '' : 's'}</span>
        <span style={{ color: selected ? T.ac2 : T.tx3 }}>{selected ? 'Its buyers are shown below' : 'Tap to see its buyers'}</span>
      </div>
      {run.step_note && <div style={{ fontSize: 11, color: T.tx2, marginTop: 6 }}>{run.step_note}</div>}
      {error && run.status !== 'running' && <div style={{ fontSize: 11, color: T.re, marginTop: 6 }}>{error}</div>}
      {log.length > 0 && (
        <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 10, color: T.tx3, lineHeight: 1.7 }}>
          {log.map((it, i) => <div key={i} style={{ color: it.result === 'lead' ? T.gr : it.result === 'known' ? T.yl : T.tx3 }}>hop {it.hop} · {it.domain} · {RESULT_TEXT[it.result]}{it.result === 'known' && it.same_as && it.same_as !== it.domain ? ` as ${it.same_as}` : ''}{it.score !== undefined ? ` (${it.score})` : ''}{it.added ? ` · +${it.added} to check` : ''}</div>)}
        </div>
      )}
    </div>
  );
}
