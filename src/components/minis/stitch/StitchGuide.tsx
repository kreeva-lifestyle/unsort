// The Stitch Calculator's user guide (owner, 2026-11-15: "Show user guide"): the steps in the order the
// screen asks for them, the formula as the owner gave it (piece wise without the area: "piece wise should
// not multiply by area"), the area multipliers and worked examples — computed by stitchModel, so the guide
// can never disagree with the calculator.
import { T, S } from '../../../lib/theme';
import { AREAS, fmtCost, fmtStep, stitchCost } from './stitchModel';

const EX = { stitch: 50000, rate: 0.3, area: 400 as const };
const ex = stitchCost(EX.stitch, EX.rate, EX.area)!;
const exPiece = stitchCost(EX.stitch, EX.rate, null, 'piece')!;
const b = (t: string) => <b style={{ color: T.tx, fontWeight: 600 }}>{t}</b>;
const head = { fontSize: 10, fontWeight: 700, color: T.tx3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '14px 0 6px' };
const mono = { fontFamily: T.mono, color: T.tx, fontSize: 12 };

export default function StitchGuide({ id }: { id: string }) {
  return (
    <section id={id} aria-label="How to use the Stitch Calculator" style={{ ...S.card, fontSize: 12, color: T.tx2, lineHeight: 1.7 }}>
      <div style={{ ...head, marginTop: 0 }}>How to use</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li>Select the {b('Area')} first: 250, 400 or 600. Piece wise does not need it.</li>
        <li>Enter the {b('Stitch')} count of the design (numbers only).</li>
        <li>Enter the {b('Rate per stitch')} (numbers only).</li>
        <li>Choose the {b('Rate')}: {b('Meter wise')} gives the cost per meter, multiplied by the area. {b('Piece wise')} gives the cost per piece and does not use the area.</li>
        <li>The {b('Cost')} appears by itself, with the working under it. Change any box and it updates. {b('Clear')} starts again.</li>
      </ol>

      <div style={head}>How the cost is worked out</div>
      <div style={mono}>Stitch ÷ 1000 × Rate per stitch = amount</div>
      <div style={mono}>Meter wise: amount × area multiplier = Cost</div>
      <div style={mono}>Piece wise: amount = Cost (no area)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {AREAS.map(a => (
          <span key={a.area} style={{ border: `1px solid ${T.bd2}`, borderRadius: T.rSm, padding: '2px 10px', fontFamily: T.mono, fontSize: 11, color: T.tx }}>
            Area {a.area} → × {fmtStep(a.factor)}
          </span>
        ))}
      </div>

      <div style={head}>Example</div>
      <div>Stitch {b(fmtStep(EX.stitch))}, Rate per stitch {b(fmtStep(EX.rate))}:</div>
      <div style={mono}>{fmtStep(EX.stitch)} ÷ 1000 × {fmtStep(EX.rate)} = {fmtStep(ex.amount)}</div>
      <div style={mono}>Meter wise, area {EX.area}: {fmtStep(ex.amount)} × {fmtStep(ex.factor!)} = {fmtCost(ex.cost)} per meter</div>
      <div style={mono}>Piece wise: {fmtCost(exPiece.cost)} per piece</div>
    </section>
  );
}
