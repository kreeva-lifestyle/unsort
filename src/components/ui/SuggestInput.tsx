// Typed suggestions that actually work on iPhone — <datalist> never shows
// its dropdown on iOS Safari, so "offered as you type" silently did nothing
// on the owner's phone. This is a plain combobox: focus or type → matching
// previously-created entries appear underneath, tap one to pick it.
// onPick fires ONLY for a tapped suggestion — callers hang autofill there,
// never on plain typing.
// The list is portaled (AnchoredList) so table cells and clipped wrappers
// can't cut it off, and it flips above the field when the keyboard is up.
import { useState } from 'react';
import { T } from '../../lib/theme';
import AnchoredList from './AnchoredList';

export default function SuggestInput({ value, onChange, onPick, options, placeholder, style, inputProps }: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (v: string) => void;
  options: string[];
  placeholder?: string;
  style?: React.CSSProperties;
  /** Extra attrs for the inner <input> — enterKeyHint, data-* markers,
   *  onKeyDown for the keyboard next-field flow. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const q = value.trim().toLowerCase();
  const matches = options
    .filter(o => o.trim() && o.trim().toLowerCase() !== q && (!q || o.toLowerCase().includes(q)))
    .slice(0, 8);
  const showList = open && matches.length > 0;
  const pick = (o: string) => { onChange(o); onPick?.(o); setOpen(false); setHi(-1); };
  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showList) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => (h + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => (h <= 0 ? matches.length - 1 : h - 1)); return; }
      if (e.key === 'Enter' && hi >= 0 && matches[hi]) { e.preventDefault(); pick(matches[hi]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setHi(-1); return; }
    }
    inputProps?.onKeyDown?.(e);
  };
  return (
    // The wrapper takes over the input's layout sizing; the input fills it.
    <div style={{ position: 'relative', flex: style?.flex, minWidth: style?.minWidth ?? 0, width: style?.width }}>
      <input {...inputProps} ref={setAnchor} value={value} onChange={e => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={e => { setOpen(true); inputProps?.onFocus?.(e); }}
        onBlur={e => { setTimeout(() => { setOpen(false); setHi(-1); }, 150); inputProps?.onBlur?.(e); }}
        onKeyDown={keyDown} autoComplete="off" role="combobox" aria-expanded={showList}
        placeholder={placeholder} style={{ ...style, flex: undefined, minWidth: 0, width: '100%' }} />
      <AnchoredList anchor={anchor} open={showList}>
        {matches.map((o, i) => (
          // onMouseDown + preventDefault: fires before the input's blur, so
          // the tap lands even though the dropdown closes on blur.
          <div key={o} role="option" aria-selected={i === hi} onMouseDown={e => { e.preventDefault(); pick(o); }} onMouseEnter={() => setHi(i)}
            style={{ padding: '9px 12px', fontSize: 12, color: T.tx, cursor: 'pointer', minHeight: 40, display: 'flex', alignItems: 'center', background: i === hi ? T.ac3 : 'transparent', borderBottom: `1px solid ${T.bd}` }}>
            {o}
          </div>
        ))}
      </AnchoredList>
    </div>
  );
}
