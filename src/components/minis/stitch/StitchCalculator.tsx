// Stitch Calculator (Minis, owner 2026-11-15): the cost of a design from its stitch count.
// Area first (250 / 400 / 600, its multiplier shown with it), then Stitch, Rate per stitch and Rate
// (Meter wise / Piece wise). Meter wise: Cost = Stitch ÷ 1000 × Rate per stitch × area multiplier; Piece
// wise: no area (owner, 2026-11-15) — the Area box is dimmed with a note. Worked out as the boxes change
// (stitchModel.ts), with the working shown under it. Nothing is saved: it is a calculator.
// The user guide (StitchGuide) sits beside it on a wide screen and under it on a phone.
import { useState } from 'react';
import { T, S } from '../../../lib/theme';
import { numericKeyDown } from '../../../lib/numericInput';
import StitchGuide from './StitchGuide';
import { AREAS, BASIS, fmtCost, fmtStep, parseNum, stitchCost, type RateBasis, type StitchArea } from './stitchModel';

export default function StitchCalculator() {
  const [area, setArea] = useState<StitchArea | null>(null);
  const [stitch, setStitch] = useState('');
  const [rate, setRate] = useState('');
  const [basis, setBasis] = useState<RateBasis>('meter');

  const s = parseNum(stitch), r = parseNum(rate);
  const piece = basis === 'piece';
  const res = stitchCost(s, r, area, basis);
  const per = BASIS.find(x => x.id === basis)!.per;
  const missing = !piece && !area ? 'Select the area first.' : s == null ? 'Enter the stitch count.' : r == null ? 'Enter the rate per stitch.' : '';
  const dirty = !!(area || stitch || rate || basis !== 'meter');
  const clear = () => { setArea(null); setStitch(''); setRate(''); setBasis('meter'); };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Stitch Calculator</div>
        <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>The cost of a design from its stitch count, rate per stitch and area.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14, alignItems: 'start', maxWidth: 980 }}>
        <section aria-label="Stitch Calculator" style={S.card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12 }}>
            <div>
              <label htmlFor="st-area" style={S.fLabel}>Area</label>
              <select id="st-area" value={area ?? ''} onChange={e => setArea(e.target.value ? Number(e.target.value) as StitchArea : null)} disabled={piece}
                aria-describedby={piece ? 'st-area-hint' : undefined} style={{ ...S.fInput, opacity: piece ? 0.5 : 1 }}>
                <option value="">Select area</option>
                {AREAS.map(a => <option key={a.area} value={a.area}>{a.area} (× {fmtStep(a.factor)})</option>)}
              </select>
              {piece && <div id="st-area-hint" style={{ fontSize: 11, color: T.tx3, marginTop: 4 }}>Not used for piece wise.</div>}
            </div>
            <div>
              <label htmlFor="st-stitch" style={S.fLabel}>Stitch</label>
              <input id="st-stitch" type="number" inputMode="numeric" min={0} step="any" value={stitch} placeholder="e.g. 50000"
                onChange={e => setStitch(e.target.value)} onKeyDown={e => numericKeyDown(e)} style={{ ...S.fInput, fontFamily: T.mono }} />
            </div>
            <div>
              <label htmlFor="st-rate" style={S.fLabel}>Rate per stitch</label>
              <input id="st-rate" type="number" inputMode="decimal" min={0} step="any" value={rate} placeholder="e.g. 0.30"
                onChange={e => setRate(e.target.value)} onKeyDown={e => numericKeyDown(e)} style={{ ...S.fInput, fontFamily: T.mono }} />
            </div>
            <div>
              <label htmlFor="st-basis" style={S.fLabel}>Rate</label>
              <select id="st-basis" value={basis} onChange={e => setBasis(e.target.value as RateBasis)} style={S.fInput}>
                {BASIS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.bd}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <output htmlFor="st-area st-stitch st-rate st-basis" aria-live="polite" style={{ display: 'block', minWidth: 0, flex: '1 1 200px' }}>
              <span style={S.fLabel}>Cost</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: res ? T.tx : T.tx3, overflowWrap: 'anywhere' }}>{res ? fmtCost(res.cost) : '—'}</span>
                {res && <span style={{ fontSize: 12, color: T.tx2 }}>{per}</span>}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: T.tx3, marginTop: 6, lineHeight: 1.6, fontFamily: res ? T.mono : T.sans, overflowWrap: 'anywhere' }}>
                {res ? <>{fmtStep(s!)} ÷ 1000 × {fmtStep(r!)} = {fmtStep(res.amount)}<br />
                  {res.factor == null ? 'Piece wise: no area multiplier' : <>{fmtStep(res.amount)} × {fmtStep(res.factor)} (area {area}) = {fmtCost(res.cost)}</>}</> : missing}
              </span>
            </output>
            <button type="button" className="touch44" onClick={clear} disabled={!dirty}
              style={{ ...S.btnGhost, opacity: dirty ? 1 : 0.5, pointerEvents: dirty ? 'auto' : 'none' }}>Clear</button>
          </div>
        </section>
        <StitchGuide id="st-guide" />
      </div>
    </div>
  );
}
