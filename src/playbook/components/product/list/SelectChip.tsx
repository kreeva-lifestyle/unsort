// A filter chip that opens the OS picker: the chip look (44px hit box holding
// a 40px pill; frosted + check when set) with a transparent native <select>
// laid over it, so long lists (vendors, websites) use the phone's own picker
// (mobile.md §8). The select is the focusable element; its focus draws the ring.
import { useState } from 'react';
import { PB, pbActive, pbBtnSecondary } from '../../../pbTheme';
import PbIcon from '../../ui/PbIcon';

export default function SelectChip({ label, value, text, active, options, onChange, placeholder }: {
  /** Screen-reader name: "Vendor". */
  label: string;
  value: string;
  /** What the chip shows ("All vendors", or the chosen name). */
  text: string;
  active: boolean;
  options: { v: string; label: string }[];
  onChange: (v: string) => void;
  /** A disabled first option shown while no option matches `value`. */
  placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <span style={{ position: 'relative', flexShrink: 0, minHeight: 'var(--pb-chip-h)', padding: '2px 0', display: 'inline-flex', alignItems: 'center', scrollSnapAlign: 'start' }}>
      <span className="pb-pill" aria-hidden="true" style={{
        ...pbBtnSecondary, minHeight: 'calc(var(--pb-chip-h) - 4px)', borderRadius: PB.r.pill, padding: '0 12px 0 14px', gap: 6, fontWeight: 500,
        ...(active ? pbActive : null),
        ...(focus ? { outline: `2px solid ${PB.focus}`, outlineOffset: 2 } : null),
      }}>
        {active && <PbIcon name="check" size={16} />}
        <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
        <PbIcon name="chevronDown" size={16} />
      </span>
      <select aria-label={label} value={placeholder && !options.some(o => o.v === value) ? '__none' : value}
        onChange={e => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 16, border: 'none', outline: 'none', colorScheme: 'dark' }}>
        {placeholder && <option value="__none" disabled>{placeholder}</option>}
        {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </span>
  );
}
