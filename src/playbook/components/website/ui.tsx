// Small form pieces shared by the Websites editor, Vendors and Settings:
// a labelled field, a section card, a segmented picker, a number input that
// keeps what is typed ("12." stays), a list editor (type → chips) and a
// multi-select of chips. Every control is a 44px tap target.
import { useState, type ReactNode } from 'react';
import { T, S } from '../../../lib/theme';
import { numKey } from '../product/status';

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14, minWidth: 0 }}>
      <label htmlFor={htmlFor} style={S.fLabel}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.tx3, marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={{ ...S.card, marginBottom: 14 }}>
      <div style={{ ...S.flexBetween, gap: 10, marginBottom: hint ? 4 : 14, flexWrap: 'wrap' }}>
        <h3 style={{ ...S.sectionTitle, margin: 0 }}>{title}</h3>
        {right}
      </div>
      {hint && <div style={{ fontSize: 12, color: T.tx3, marginBottom: 14, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </section>
  );
}

/** Two-column grid that drops to one column on narrow screens. */
export const Grid2 = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', columnGap: 14 }}>{children}</div>
);

export const input44 = { ...S.fInput, minHeight: 44 };

export function Seg<V extends string>({ value, options, onChange, label }: {
  value: V; options: { id: V; label: string; hint?: string }[]; onChange: (v: V) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)} title={o.hint}
            style={{
              flex: '1 1 auto', minHeight: 44, padding: '6px 12px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans,
              fontSize: 12, fontWeight: on ? 600 : 500, textAlign: 'left',
              border: `1px solid ${on ? T.ac55 : T.bd2}`, background: on ? T.ac3 : T.glass1, color: on ? T.tx : T.tx2,
            }}>
            {o.label}
            {o.hint && <span style={{ display: 'block', fontSize: 10, color: T.tx3, fontWeight: 400, marginTop: 2 }}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const parseNum = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

/** Number input; null when empty. Shows exactly what is typed while focused. Letters are blocked (numKey). */
export function NumInput({ value, onChange, id, placeholder, min = 0, max }: {
  value: number | null; onChange: (v: number | null) => void; id?: string; placeholder?: string; min?: number; max?: number;
}) {
  const [raw, setRaw] = useState('');
  const [focus, setFocus] = useState(false);
  const outside = value == null ? '' : String(value);
  return (
    <input id={id} type="text" inputMode="decimal" value={focus ? raw : outside} placeholder={placeholder} onKeyDown={numKey}
      onFocus={() => { setRaw(outside); setFocus(true); }} onBlur={() => setFocus(false)}
      onChange={e => {
        const s = e.target.value.replace(/[^0-9.]/g, '');
        setRaw(s);
        let n = parseNum(s);
        if (n != null && max != null) n = Math.min(n, max);
        if (n != null) n = Math.max(n, min);
        onChange(n);
      }}
      style={input44} />
  );
}

const chip = (on: boolean) => ({
  minHeight: 44, padding: '0 12px', borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, fontSize: 12,
  display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
  border: `1px solid ${on ? T.ac55 : T.bd2}`, background: on ? T.ac3 : T.glass1, color: on ? T.tx : T.tx2,
});

/** Free list: type a value + Enter / Add; tap a chip to remove it. Case-insensitive dedupe. */
export function ChipsInput({ values, onChange, placeholder, id, maxLen = 120, mono }: {
  values: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; maxLen?: number; mono?: boolean;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(/[\n,]/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!parts.length) return;
    const out = [...values];
    for (const p of parts) if (!out.some(o => o.toLowerCase() === p.toLowerCase())) out.push(p.slice(0, maxLen));
    onChange(out); setText('');
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input id={id} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} maxLength={maxLen * 4}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ ...input44, fontFamily: mono ? T.mono : T.sans }} />
        <button type="button" onClick={add} style={{ ...S.btnGhost, minHeight: 44, flexShrink: 0 }}>Add</button>
      </div>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {values.map(v => (
            <button key={v} type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}
              style={{ ...chip(true), fontFamily: mono ? T.mono : T.sans }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              <span aria-hidden style={{ color: T.tx3, fontSize: 15 }}>&#215;</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick any number of options (tap to toggle). */
export function PickChips({ options, selected, onChange, empty }: {
  options: { id: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void; empty?: string;
}) {
  if (!options.length) return <div style={{ fontSize: 12, color: T.tx3 }}>{empty || 'Nothing to pick yet.'}</div>;
  const has = (id: string) => selected.some(s => s.toLowerCase() === id.toLowerCase());
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const on = has(o.id);
        return (
          <button key={o.id} type="button" aria-pressed={on} style={chip(on)}
            onClick={() => onChange(on ? selected.filter(s => s.toLowerCase() !== o.id.toLowerCase()) : [...selected, o.id])}>
            {on && <span aria-hidden style={{ color: T.gr }}>&#10003;</span>}{o.label}
          </button>
        );
      })}
    </div>
  );
}
