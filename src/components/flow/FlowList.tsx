// Flow — every pipeline: totals, search, filters (status, where it is, who,
// due), one row per pipeline with its steps as a chain, and "Next up" for the
// cutting master, tailors and job workers. "+ New Pipeline" starts one.
import { useCallback, useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';
import FlowRow from './FlowRow';
import FlowNextUp from './FlowNextUp';
import NewFlowModal from './NewFlowModal';
import { listPipelines, type PipelineRow } from './flowData';
import { KINDS, isLate, tint } from './flowModel';
import type { FlowKind } from '../../types/flow';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const inWeek = (d: string | null) => !!d && d >= today() && d <= new Date(Date.now() + 5.5 * 3600e3 + 7 * 864e5).toISOString().slice(0, 10);

export default function FlowList({ onOpen, addToast, active }: { onOpen: (id: string) => void; addToast: (m: string, t?: string) => void; active: boolean }) {
  const [rows, setRows] = useState<PipelineRow[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('open');
  const [at, setAt] = useState('');
  const [who, setWho] = useState('');
  const [due, setDue] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await listPipelines()); setErr(''); } catch (e) { setErr(friendlyError(e)); }
  }, []);
  useEffect(() => { if (active) load(); }, [active, load]);

  const all = rows || [];
  const late = (p: PipelineRow) => isLate(p.due_date, p.status === 'done' || p.status === 'cancelled') || p.flow_steps.some(s => isLate(s.due_date, s.status === 'done'));
  const people = [...new Set(all.flatMap(p => p.flow_steps.map(s => s.assignee).filter(Boolean)))].sort() as string[];
  const text = q.trim().toLowerCase();
  const shown = all.filter(p =>
    (status === 'all' || (status === 'open' ? p.status === 'planning' || p.status === 'running' : p.status === status))
    && (!text || [p.title, p.sku, `f-${p.flow_number}`, ...p.flow_steps.map(s => `${s.title} ${s.assignee ?? ''}`)].join(' ').toLowerCase().includes(text))
    && (!at || p.flow_steps.some(s => s.kind === at && (s.status === 'active' || s.status === 'blocked')))
    && (!who || p.flow_steps.some(s => s.assignee === who))
    && (!due || (due === 'late' ? late(p) : inWeek(p.due_date))));
  const open = all.filter(p => p.status === 'planning' || p.status === 'running');
  const tile = (label: string, value: number, sub: string, c: string) => ({ label, value, sub, c });
  const tiles = [
    tile('Running', all.filter(p => p.status === 'running').length, `${open.reduce((t, p) => t + (p.status === 'running' ? p.pieces || 0 : 0), 0)} pcs in work`, T.ac2),
    tile('Planning', all.filter(p => p.status === 'planning').length, 'not started yet', T.bl),
    tile('Late', open.filter(late).length, 'past a due date', T.re),
    tile('Stuck steps', open.reduce((t, p) => t + p.flow_steps.filter(s => s.status === 'blocked').length, 0), 'need someone to act', T.yl),
    tile('Done', all.filter(p => p.status === 'done').length, 'pipelines finished', T.gr),
  ];
  const sel = (label: string, value: string, set: (v: string) => void, opts: [string, string][]) => (
    <label><span style={S.fLabel}>{label}</span>
      <select value={value} onChange={e => set(e.target.value)} style={S.fInput}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );

  return (
    <div className="page-pad" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: T.sans, color: T.tx }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: T.tx3 }}>{open.length} open pipeline{open.length === 1 ? '' : 's'} · fabric → cutting → job work → tailor → stock</span>
        <button type="button" className="desktop-only" onClick={() => setCreating(true)} style={S.btnPrimary}>+ New Pipeline</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ background: tint(t.c, 0.06), border: `1px solid ${tint(t.c, 0.18)}`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.c }}>{t.label}</div>
            <div style={{ fontFamily: T.sora, fontSize: 20, fontWeight: 800, color: t.c }}>{t.value}</div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: t.c, opacity: 0.85 }}>{t.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, SKU, F-number, step or person..." aria-label="Search pipelines" style={S.fSearch} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {sel('Status', status, setStatus, [['open', 'Open (planning + running)'], ['running', 'Running'], ['planning', 'Planning'], ['done', 'Done'], ['cancelled', 'Cancelled'], ['all', 'All']])}
          {sel('Working on', at, setAt, [['', 'Any step'], ...(['po', 'cutting', 'jobwork', 'stitching', 'qc', 'packing'] as FlowKind[]).map(k => [k, KINDS[k].label] as [string, string])])}
          {sel('Person / vendor', who, setWho, [['', 'Anyone'], ...people.map(p => [p, p] as [string, string])])}
          {sel('Due', due, setDue, [['', 'Any date'], ['late', 'Late'], ['week', 'Next 7 days']])}
        </div>
      </div>
      {err && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re }}>{err} <button type="button" onClick={load} style={{ ...S.btnGhost, ...S.btnSm, marginLeft: 8 }}>Retry</button></div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section aria-label="Pipelines" style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows === null && !err && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading…</div>}
          {rows && all.length === 0 && <Empty icon="clipboard" title="No pipelines yet" message="Build one for your next batch: fabric PO → cutting → job work → tailor → stock." cta="+ New Pipeline" onCta={() => setCreating(true)} />}
          {rows && all.length > 0 && shown.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: T.tx3, fontSize: 12, background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10 }}>No pipeline matches these filters.</div>}
          {shown.map(p => <FlowRow key={p.id} p={p} onOpen={() => onOpen(p.id)} />)}
        </section>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}><FlowNextUp pipes={all} /></div>
      </div>
      <button type="button" className="fab" onClick={() => setCreating(true)} aria-label="New pipeline">+</button>
      {creating && <NewFlowModal addToast={addToast} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); onOpen(id); }} />}
    </div>
  );
}
