// One MAIN COMPONENT as a collapsible card (owner-approved redesign): the
// header shows name + total and folds the body away; expanded, each sub is
// a READABLE row (name, supplier · code, cheaper-supplier nudge, qty × rate,
// cost) that opens the LineSheet editor on tap — no grid of open inputs.
// Same data shapes as before; only the screens changed.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import {
  CostingComponent, CostingLibrary, blankSub,
  selectedSupplier, subCost, componentCost, money, subProblems, cheaperAlt, num,
} from './costingModel';
import LineSheet from './LineSheet';
import SubChips, { SubPreset } from './SubChips';
import SuggestInput from '../../ui/SuggestInput';

const BAD = '1px solid rgba(239,68,68,.55)';

export default function ComponentCard({ comp, idx, library, topSubs, defaultOpen, onChange, onRemove }: {
  comp: CostingComponent;
  idx: number;
  library: CostingLibrary;
  topSubs: SubPreset[];
  defaultOpen: boolean;
  onChange: (next: CostingComponent) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [lineFor, setLineFor] = useState<number | null>(null);

  const patchSub = (i: number, next: ReturnType<typeof blankSub>) =>
    onChange({ ...comp, subs: comp.subs.map((s, j) => (j === i ? next : s)) });
  const removeSub = (i: number) => onChange({ ...comp, subs: comp.subs.filter((_, j) => j !== i) });
  const addLine = (s = blankSub()) => {
    onChange({ ...comp, subs: [...comp.subs, s] });
    setLineFor(comp.subs.length);   // open the fresh line straight away
  };

  return (
    <div data-fx={`cost-f-${idx}`} style={{ border: `1px solid ${T.bd}`, borderRadius: 14, background: 'rgba(255,255,255,0.02)', marginBottom: 10, overflow: 'hidden' }}>
      {/* Header: tap to fold/unfold */}
      <div onClick={() => setOpen(o => !o)} role="button"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', cursor: 'pointer', minHeight: 44 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: comp.name.trim() ? T.tx2 : T.re }}>
          {comp.name.trim() || `Component ${idx + 1} — name it *`}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: T.ac2 }}>{money(componentCost(comp))}</span>
        <span style={{ color: T.tx3, fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${T.bd}`, padding: '10px 14px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <SuggestInput value={comp.name} onChange={v => onChange({ ...comp, name: v })} options={library.mains}
              placeholder="Main component — e.g. Fabric *" style={{ ...S.fInput, flex: 1, minWidth: 0, ...(comp.name.trim() ? {} : { border: BAD }) }} />
            <button onClick={onRemove} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 36 }}>Remove</button>
          </div>

          {comp.subs.map((s, i) => {
            const sel = selectedSupplier(s);
            const bad = subProblems(s);
            const hasBad = bad.name || bad.qty || bad.unit || bad.supplier || bad.rate;
            const alt = cheaperAlt(s);
            return (
              <div key={i} data-fx={`cost-f-${idx}-${i}`} onClick={() => setLineFor(i)} role="button"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px 10px 10px', borderTop: `1px solid ${T.bd}`, cursor: 'pointer', borderLeft: hasBad ? BAD : '3px solid transparent' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: s.name.trim() ? T.tx : T.re, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.name.trim() || 'Tap to fill this line *'}
                  </div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sel?.name.trim() ? <>{sel.name}{sel.materialCode.trim() ? <> · <span style={{ fontFamily: T.mono, color: T.tx2 }}>{sel.materialCode}</span></> : null}</> : <span style={{ color: bad.supplier ? T.re : T.tx3 }}>no supplier</span>}
                  </div>
                  {alt && <div style={{ fontSize: 9, color: T.yl, marginTop: 2 }}>▼ {alt.name} {money(alt.saving)} cheaper</div>}
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: T.tx2, fontFamily: T.mono }}>{num(s.qty) || 0} {s.unit || '?'} × {money(num(sel?.rate))}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.mono, color: T.tx, marginTop: 2 }}>{money(subCost(s))}</div>
                </div>
                <span style={{ color: T.tx3, fontSize: 15, padding: '0 6px' }}>›</span>
              </div>
            );
          })}

          <div style={{ borderTop: comp.subs.length ? `1px solid ${T.bd}` : 'none', paddingTop: comp.subs.length ? 4 : 0 }}>
            <SubChips presets={topSubs} comp={comp} onAdd={s => addLine(s)} />
            <button onClick={() => addLine()} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 32, marginTop: 8, borderStyle: 'dashed' }}>+ Add line</button>
          </div>
        </div>
      )}

      {lineFor !== null && comp.subs[lineFor] && (
        <LineSheet sub={comp.subs[lineFor]} compName={comp.name} library={library}
          onChange={next => patchSub(lineFor, next)}
          onRemove={() => removeSub(lineFor)}
          onClose={() => setLineFor(null)} />
      )}
    </div>
  );
}
