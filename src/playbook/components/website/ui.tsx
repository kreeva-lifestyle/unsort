// Small form pieces shared by the Websites editor, Vendors and Settings:
// a labelled field, a section card, a segmented picker, a number input that
// keeps what is typed ("12." stays), a list editor (type → chips) and a
// multi-select of chips. V2 look (pbInput / pbLabel / pbActive); every control
// is 48px on touch (40 on a fine pointer, 44px chip hit boxes).
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PB, pbActive, pbBody, pbBtnSecondary, pbInput, pbLabel, pbMeta, pbNum, pbTileFlat, pbTileTitle } from '../../pbTheme';

/** Help copy is body text (13px, tx2), not 12px meta (DESIGN.md §3). */
const hintText = { ...pbBody, color: PB.tx2 } as const;
/** "1,234 becomes 1,230": the figures a reader compares go in mono. */
const figures = (s: string) => s.split(/(\d[\d,.]*)/).map((part, i) => (i % 2 ? <span key={i} style={pbNum}>{part}</span> : part));
import PbIcon from '../ui/PbIcon';
import { numKey } from '../product/status';

/** Label above, hint below (id `${htmlFor}-hint` for aria-describedby), optional error in PB.failed. */
export function Field({ label, hint, htmlFor, children, error }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode; error?: ReactNode }) {
  return (
    <div style={{ marginBottom: 16, minWidth: 0 }}>
      <label htmlFor={htmlFor} style={pbLabel}>{label}</label>
      {children}
      {hint && <div id={htmlFor ? `${htmlFor}-hint` : undefined} style={{ ...hintText, marginTop: 8 }}>{hint}</div>}
      {error && <div id={htmlFor ? `${htmlFor}-error` : undefined} style={{ fontSize: 12, lineHeight: 1.5, color: PB.failed, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/** A titled glass tile (settings / editor sections). Flat (no blur): editor
 *  pages stack several, and blur stays within the 6-surface budget. Never nest tiles inside.
 *  Siblings are spaced by their grid (SectionGrid), not by a margin here. */
export function Section({ title, hint, children, right }: { title: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section style={pbTileFlat}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: hint ? 4 : 16, flexWrap: 'wrap' }}>
        <h2 style={pbTileTitle}>{title}</h2>
        {right}
      </div>
      {hint && <div style={{ ...hintText, marginBottom: 16, maxWidth: 640 }}>{hint}</div>}
      {children}
    </section>
  );
}

/** Two-column grid that drops to one column on narrow screens. */
export const Grid2 = ({ children }: { children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', columnGap: 16 }}>{children}</div>
);

/** Kept for existing importers: the V2 input recipe (add className="pb-input"). */
export const input44 = pbInput;

/** Segmented picker: role=radiogroup, roving tabindex, arrows / Home / End move and select. */
export function Seg<V extends string>({ value, options, onChange, label }: {
  value: V; options: { id: V; label: string; hint?: string }[]; onChange: (v: V) => void; label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = Math.max(0, options.findIndex(o => o.id === value));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = options.length;
    const i = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (cur + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (cur - 1 + n) % n
        : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (i < 0) return;
    e.preventDefault();
    onChange(options[i].id);
    refs.current[i]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: PB.r.btn, background: 'var(--pb-tile-fill)', border: `1px solid ${PB.tileBd}`, boxShadow: PB.tileHi }}>
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button key={o.id} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={i === cur ? 0 : -1}
            onClick={() => onChange(o.id)} title={o.hint} className="pb-pill"
            style={{
              flex: '1 1 auto', minHeight: 'var(--pb-chip-h)', padding: '6px 12px', borderRadius: PB.r.input, cursor: 'pointer',
              fontFamily: PB.sans, fontSize: 'var(--pb-seg-fs)', fontWeight: 500, textAlign: 'left', lineHeight: 1.3,
              border: '1px solid transparent', background: 'transparent', color: PB.tx2,
              ...(on ? pbActive : null),
            }}>
            {o.label}
            {o.hint && <span style={{ display: 'block', fontSize: 12, color: on ? PB.onActive : PB.tx2, fontWeight: 400, marginTop: 2 }}>{figures(o.hint)}</span>}
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
      className="pb-input" style={{ ...pbInput, ...pbNum }} />
  );
}

const chip = (on: boolean) => ({
  ...pbBtnSecondary, minHeight: 'var(--pb-chip-h)', padding: '0 14px', borderRadius: PB.r.pill, fontWeight: 500, gap: 6,
  ...(on ? pbActive : null),
});

/** Free list: type a value + Enter / Add; tap a chip to remove it. Case-insensitive dedupe. */
export function ChipsInput({ values, onChange, placeholder, id, maxLen = 120, mono, label }: {
  values: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string; maxLen?: number; mono?: boolean;
  /** Accessible name when no <label htmlFor={id}> names the input. */
  label?: string;
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
      <div style={{ display: 'flex', gap: 8 }}>
        <input id={id} aria-label={label} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} maxLength={maxLen * 4}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="pb-input" style={{ ...pbInput, fontFamily: mono ? PB.mono : PB.sans }} />
        {/* Nothing typed = nothing to add; the empty box beside it is the reason. */}
        <button type="button" onClick={add} disabled={!text.trim()} className="pb-pill" style={{ ...pbBtnSecondary, flexShrink: 0, ...(text.trim() ? null : { opacity: 0.5, cursor: 'not-allowed' }) }}>Add</button>
      </div>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {values.map(v => (
            <button key={v} type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter(x => x !== v))}
              className="pb-pill" style={{ ...chip(false), fontFamily: mono ? PB.mono : PB.sans }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{v}</span>
              <span style={{ color: PB.tx3, display: 'inline-flex' }}><PbIcon name="x" size={16} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick any number of options (tap to toggle). Picked = frosted active + check. */
export function PickChips({ options, selected, onChange, empty, label }: {
  options: { id: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void; empty?: string;
  /** Names the group for screen readers (the Field label is tied to no control). */
  label?: string;
}) {
  if (!options.length) return <div style={pbMeta}>{empty || 'Nothing to pick yet.'}</div>;
  const has = (id: string) => selected.some(s => s.toLowerCase() === id.toLowerCase());
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const on = has(o.id);
        return (
          <button key={o.id} type="button" aria-pressed={on} style={chip(on)} className="pb-pill"
            onClick={() => onChange(on ? selected.filter(s => s.toLowerCase() !== o.id.toLowerCase()) : [...selected, o.id])}>
            {on && <PbIcon name="check" size={16} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}
