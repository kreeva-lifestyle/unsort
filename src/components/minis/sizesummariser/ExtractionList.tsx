// The sheets made so far, newest first: order, product, when, which model,
// how many warnings and doubtful fields. Tap a row to reopen its sheet;
// "Re-run on…" extracts the same PDF again on another model and keeps both
// rows, with a side-by-side of every measurement and choice (how Haiku gets
// judged against Sonnet on real orders before anyone flips the default).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { fmtWhen } from '../../../lib/humanize';
import { useModalLock } from '../../../hooks/useModalLock';
import type { ExtractionRow, Extraction } from './types';

const MODELS = [{ id: 'claude-haiku-5-5', name: 'Haiku 5.5' }, { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' }, { id: 'claude-opus-5-5', name: 'Opus 5.5' }];
const short = (m: string) => MODELS.find(x => x.id === m)?.name || m;

/** Every measurement and choice of two runs, side by side; differences marked. */
function Compare({ a, b, onClose }: { a: ExtractionRow; b: ExtractionRow; onClose: () => void }) {
  useModalLock();
  const rowsOf = (ex: Extraction) => {
    const m = new Map<string, string>();
    for (const x of ex.measurements) m.set(x.key, x.value === null ? 'null' : `${x.value}${x.unit === 'cm' ? 'cm' : '"'}`);
    for (const x of ex.choices) m.set(x.key, x.answered ? x.value_en || x.value_hi : '(unanswered)');
    return m;
  };
  const A = rowsOf(a.extraction), B = rowsOf(b.extraction);
  const keys = [...new Set([...A.keys(), ...B.keys()])];
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}><span style={S.modalTitle}>{a.order_no} · {short(a.model)} vs {short(b.model)}</span><button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button></div>
        <div style={{ padding: '10px 18px', overflowY: 'auto', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Field', short(a.model), short(b.model)].map(h => <th key={h} style={S.thStyle}>{h}</th>)}</tr></thead>
            <tbody>{keys.map(k => { const diff = A.get(k) !== B.get(k); return (
              <tr key={k} style={{ background: diff ? 'oklch(0.63 0.22 25 / .08)' : undefined }}>
                <td style={{ ...S.tdStyle, fontFamily: T.mono, fontSize: 11 }}>{k}</td>
                <td style={{ ...S.tdStyle, fontSize: 12 }}>{A.get(k) ?? <span style={{ color: T.tx3 }}>—</span>}</td>
                <td style={{ ...S.tdStyle, fontSize: 12, color: diff ? T.re : undefined }}>{B.get(k) ?? <span style={{ color: T.tx3 }}>—</span>}</td>
              </tr>); })}</tbody>
          </table>
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Close</button></div>
      </div>
    </div>, document.body);
}

export default function ExtractionList({ rows, onOpen, onRerun, busy }: { rows: ExtractionRow[] | null; onOpen: (r: ExtractionRow) => void; onRerun: (r: ExtractionRow, model: string) => void; busy: boolean }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [cmp, setCmp] = useState<[ExtractionRow, ExtractionRow] | null>(null);
  if (rows === null) return <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No sheets yet. The first form you drop above appears here.</div>;
  const byId = new Map(rows.map(r => [r.id, r]));
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.bd}`, fontSize: 9, fontWeight: 600, color: T.tx3, letterSpacing: 1.5, textTransform: 'uppercase' }}>Sheets made · {rows.length}</div>
      {rows.map(r => {
        const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${T.bd}` }}>
            <div role="button" onClick={() => onOpen(r)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: T.mono, fontWeight: 700, color: T.tx }}>{r.order_no || '—'}</span>
                <span style={{ fontSize: 12, color: T.tx2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.extraction?.order?.product_name || r.file_name}</span>
              </div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                {fmtWhen(r.created_at)} · {short(r.model)} · v{r.prompt_version}{r.est_usd ? ` · $${Number(r.est_usd).toFixed(3)}` : ''}
                {r.warnings_count ? <span style={{ color: T.yl }}> · {r.warnings_count} warning{r.warnings_count === 1 ? '' : 's'}</span> : null}
                {r.low_confidence_count ? <span style={{ color: T.re }}> · {r.low_confidence_count} doubtful</span> : null}
                {parent ? <span style={{ color: T.ac2 }}> · re-run of {short(parent.model)}</span> : null}
              </div>
            </div>
            {parent && <button type="button" onClick={() => setCmp([parent, r])} style={{ ...S.btnGhost, ...S.btnSm }}>Compare</button>}
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setMenu(menu === r.id ? null : r.id)} disabled={busy} style={{ ...S.btnGhost, ...S.btnSm, opacity: busy ? 0.5 : 1 }}>Re-run on…</button>
              {menu === r.id && (
                <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: T.s, border: `1px solid ${T.bd2}`, borderRadius: 8, padding: 4, minWidth: 140, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                  {MODELS.filter(m => m.id !== r.model).map(m => <button key={m.id} type="button" onClick={() => { setMenu(null); onRerun(r, m.id); }} style={{ ...S.btnGhost, display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 6 }}>{m.name}</button>)}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {cmp && <Compare a={cmp[0]} b={cmp[1]} onClose={() => setCmp(null)} />}
    </div>
  );
}
