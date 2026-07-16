// One template dropdown column on the Bulk Teach coverage board: collapsed
// tallies (auto / taught / needs-you / ignored), expandable to the unmatched
// master values + any stale lessons. AI Suggest is strictly on demand.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import ValueRow from './ValueRow';
import { ScanColumn, StagedLesson, lessonKey, estimateSuggestUsd } from './bulkApi';

const Tally = ({ color, n, label }: { color: string; n: number; label: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: T.tx3 }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
    {n} {label}
  </span>
);

export default function ColumnCard({ col, allowed, staged, suggestions, defaultOpen, suggesting, onStage, onIgnore, onUnstage, onSuggest }: {
  col: ScanColumn;
  allowed: string[];
  staged: Record<string, StagedLesson>;
  suggestions: Record<string, string>;
  defaultOpen: boolean;
  suggesting: boolean;
  onStage: (source: string, target: string) => void;
  onIgnore: (source: string) => void;
  onUnstage: (source: string) => void;
  onSuggest: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const keyOf = (source: string) => lessonKey(col.fieldKey, source);
  const pending = [...col.unmatched.map(u => u.value), ...col.stale.map(s => s.source)]
    .filter(v => { const st = staged[keyOf(v)]; return !st; });
  const needsYou = col.unmatched.length + col.stale.length;
  const settled = needsYou === 0;

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${settled ? T.bd : 'rgba(239,68,68,.18)'}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap' }}>
        <span style={{ color: T.tx3, fontSize: 10, width: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>&#9654;</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.tx, letterSpacing: '.04em' }}>{col.header}</span>
        <span style={{ display: 'flex', gap: 11, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
          <Tally color={T.gr} n={col.auto} label="auto" />
          {col.taught > 0 && <Tally color={T.ac2} n={col.taught} label="taught" />}
          {needsYou > 0 && <Tally color={T.re} n={needsYou} label="need you" />}
          {col.ignored > 0 && <Tally color={T.tx3} n={col.ignored} label="ignored" />}
        </span>
        {pending.length > 0 && (
          <button onClick={e => { e.stopPropagation(); if (!suggesting) onSuggest(); }}
            title="One AI call proposes a marketplace value for each remaining master value in this column — you still review and Teach each one."
            style={{ ...S.btnGhost, ...S.btnSm, color: T.yl, border: '1px solid rgba(245,158,11,.25)', background: 'rgba(245,158,11,.06)', pointerEvents: suggesting ? 'none' : 'auto', opacity: suggesting ? 0.5 : 1 }}>
            {suggesting ? 'Suggesting…' : <>&#10022; Suggest ({pending.length}) &middot; {estimateSuggestUsd(pending.length)}</>}
          </button>
        )}
      </div>
      {open && (
        <div style={{ borderTop: `1px solid ${T.bd}` }}>
          {col.stale.map(s => (
            <ValueRow key={`stale-${s.source}`} value={s.source} count={0} allowed={allowed}
              staged={staged[keyOf(s.source)]} suggestion={suggestions[keyOf(s.source)]} staleTarget={s.target}
              onStage={t => onStage(s.source, t)} onIgnore={() => onIgnore(s.source)} onUnstage={() => onUnstage(s.source)} />
          ))}
          {col.unmatched.map(u => (
            <ValueRow key={u.value} value={u.value} count={u.count} allowed={allowed}
              staged={staged[keyOf(u.value)]} suggestion={suggestions[keyOf(u.value)]}
              onStage={t => onStage(u.value, t)} onIgnore={() => onIgnore(u.value)} onUnstage={() => onUnstage(u.value)} />
          ))}
          {needsYou === 0 && (
            <div style={{ padding: '14px', fontSize: 11, color: T.tx3, textAlign: 'center' }}>
              All {col.distinct} value(s) settled — {col.auto} match automatically{col.taught ? `, ${col.taught} taught` : ''}{col.ignored ? `, ${col.ignored} ignored` : ''}.
            </div>
          )}
          {col.truncated > 0 && (
            <div style={{ padding: '8px 14px', fontSize: 10, color: T.yl }}>
              {col.truncated} rarer value(s) not shown — teach these first, then Rescan.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
