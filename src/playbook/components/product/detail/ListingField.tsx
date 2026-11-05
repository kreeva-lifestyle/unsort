// One labelled field of the listing editor: input or growing textarea, a
// "Kept" tag when staff edited it (Regenerate keeps it), and an optional
// length counter. V2 look: pbLabel above, pbInput / pbTextarea.
import { PB, pbInput, pbLabel, pbNum, pbTextarea } from '../../../pbTheme';
import PbTag from '../../ui/PbTag';
import { numKey } from '../status';

type Props = {
  id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean; kept?: boolean;
  area?: number; max?: number; num?: boolean; mono?: boolean;
};

/** "Kept" tag: the field was typed by hand and the AI keeps it. */
export function KeptTag({ hint }: { hint: string }) {
  return <span title={hint} style={{ display: 'inline-flex', textTransform: 'none', letterSpacing: 0 }}><PbTag style={{ fontSize: 11, padding: '0 8px' }}>Kept</PbTag><span className="pb-sr">: {hint}</span></span>;
}

export default function ListingField({ id, label, value, onChange, disabled, kept, area, max, num, mono }: Props) {
  const over = max != null && value.length > max;
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={{ ...pbLabel, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ minWidth: 0 }}>{label}</span>
        {kept && <KeptTag hint="Edited by hand — Regenerate keeps it" />}
        {max ? <span style={{ ...pbNum, marginLeft: 'auto', color: over ? PB.review : PB.tx2, textTransform: 'none', letterSpacing: 0 }}>{value.length}/{max}</span> : null}
      </label>
      {area
        ? <textarea id={id} value={value} rows={area} disabled={disabled} onChange={e => onChange(e.target.value)} className="pb-input"
            style={{ ...pbTextarea, height: 'auto', fontFamily: mono ? PB.mono : PB.sans, opacity: disabled ? 0.6 : 1 }} />
        : <input id={id} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="pb-input"
            style={{ ...pbInput, ...(num ? pbNum : null), opacity: disabled ? 0.6 : 1 }}
            {...(num ? { type: 'number', inputMode: 'decimal' as const, min: 0, step: '0.01', onKeyDown: numKey } : {})} />}
    </div>
  );
}
