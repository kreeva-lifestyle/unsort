// Typed suggestions that actually work on iPhone — <datalist> never shows
// its dropdown on iOS Safari, so "offered as you type" silently did nothing
// on the owner's phone. This is a plain combobox: focus or type → matching
// previously-created entries appear underneath, tap one to pick it.
// onPick fires ONLY for a tapped suggestion — callers hang autofill there,
// never on plain typing.
import { useState } from 'react';
import { T } from '../../lib/theme';

export default function SuggestInput({ value, onChange, onPick, options, placeholder, style }: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (v: string) => void;
  options: string[];
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = options
    .filter(o => o.trim() && o.trim().toLowerCase() !== q && (!q || o.toLowerCase().includes(q)))
    .slice(0, 8);
  return (
    // The wrapper takes over the input's layout sizing; the input fills it.
    <div style={{ position: 'relative', flex: style?.flex, minWidth: style?.minWidth ?? 0, width: style?.width }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder} style={{ ...style, flex: undefined, minWidth: 0, width: '100%' }} />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 300, background: T.s3, border: `1px solid ${T.bd2}`, borderRadius: 8, maxHeight: 190, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>
          {matches.map(o => (
            // onMouseDown + preventDefault: fires before the input's blur, so
            // the tap lands even though the dropdown closes on blur.
            <div key={o} onMouseDown={e => { e.preventDefault(); onChange(o); onPick?.(o); setOpen(false); }}
              style={{ padding: '9px 12px', fontSize: 12, color: T.tx, cursor: 'pointer', minHeight: 36, display: 'flex', alignItems: 'center' }}>
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
