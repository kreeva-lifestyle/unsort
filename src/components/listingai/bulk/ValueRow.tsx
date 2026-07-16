// One unmatched master value inside a Bulk Teach column card: pick the
// marketplace value (select = the column's allowed list ONLY, so a bad
// export is structurally impossible) then Teach, or Ignore it forever.
// An AI suggestion pre-selects in amber — nothing saves without a tap.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import type { StagedLesson } from './bulkApi';

export default function ValueRow({ value, count, allowed, staged, suggestion, staleTarget, onStage, onIgnore, onUnstage }: {
  value: string;
  count: number;
  allowed: string[];
  staged?: StagedLesson;     // already staged this session (teach or ignore)
  suggestion?: string;       // AI-proposed target (canon-validated server-side)
  staleTarget?: string;      // previously taught target no longer in the list
  onStage: (target: string) => void;
  onIgnore: () => void;
  onUnstage: () => void;
}) {
  const [picked, setPicked] = useState('');
  const sel = picked || suggestion || '';

  if (staged) {
    const ignored = staged.ignored;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${T.bd}`, background: ignored ? 'transparent' : 'rgba(34,197,94,.04)', opacity: ignored ? 0.45 : 1, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.tx, flex: 1, minWidth: 120, wordBreak: 'break-word', textDecoration: ignored ? 'line-through' : 'none' }}>{staged.source}</span>
        {ignored ? (
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(255,255,255,.06)', color: T.tx3 }}>ignored — never suggested again</span>
        ) : (
          <span style={{ fontSize: 12, color: T.gr, fontWeight: 600 }}>→ {staged.target}</span>
        )}
        <button onClick={onUnstage} style={{ ...S.btnGhost, ...S.btnSm }}>Undo</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.tx, flex: 1, minWidth: 120, wordBreak: 'break-word' }}>
        {value}
        {count > 0 && <span style={{ fontSize: 10, color: T.tx3, marginLeft: 6 }}>&times;{count}</span>}
      </span>
      {staleTarget !== undefined && (
        <span title="This value was taught before, but the marketplace removed the old choice from its dropdown — pick the new one." style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(239,68,68,.12)', color: T.re }}>
          was "{staleTarget}" — no longer in the list
        </span>
      )}
      {suggestion && !picked && (
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: 'rgba(245,158,11,.12)', color: T.yl, whiteSpace: 'nowrap' }}>&#10022; AI suggested</span>
      )}
      <select value={sel} onChange={e => setPicked(e.target.value)}
        style={{ ...S.fInput, width: 180, height: 32, fontSize: 12, color: sel ? (suggestion && !picked ? T.yl : T.ac2) : T.tx3, borderColor: suggestion && !picked && sel ? 'rgba(245,158,11,.4)' : undefined }}>
        <option value="">Use instead&hellip;</option>
        {allowed.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <button onClick={() => sel && onStage(sel)} disabled={!sel}
        style={{ ...S.btnGhost, ...S.btnSm, color: T.ac2, border: '1px solid rgba(99,102,241,.35)', opacity: sel ? 1 : 0.35 }}>Teach</button>
      <button onClick={onIgnore} title="Never show this value again — it stays with the AI on runs"
        style={{ ...S.btnGhost, ...S.btnSm, color: T.tx3 }}>Ignore</button>
    </div>
  );
}
