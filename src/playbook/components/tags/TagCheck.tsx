// A checkbox with a 44px hit box (the whole label, `text` included — so
// "Select all" is part of the target), drawn as a 20px glass box with a
// check when on. The native input covers the label (opacity 0) so it stays
// a real checkbox for keyboards and screen readers; the focus ring is the
// Playbook one (pb-focus on the box via :focus-visible + span).
import type { ReactNode } from 'react';
import { PB, pbActive } from '../../pbTheme';
import PbIcon from '../ui/PbIcon';

export default function TagCheck({ checked, onChange, label, text }: { checked: boolean; onChange: (on: boolean) => void; label: string; text?: ReactNode }) {
  return (
    <label className="pb-check" style={{ position: 'relative', width: text ? 'auto' : 44, minWidth: 44, height: 44, paddingRight: text ? 8 : 0, gap: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer', fontSize: 16 }} />
      <span aria-hidden="true" style={{
        width: 20, height: 20, borderRadius: PB.r.skel, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Checked = the frosted active recipe (never the gradient, which is the hero's and the primary button's).
        background: checked ? pbActive.background : PB.ctl, border: `1px solid ${checked ? PB.activeBd : PB.inputBd}`, color: PB.onActive,
        ...(checked ? { boxShadow: pbActive.boxShadow } : null),
      }}>
        {checked && <PbIcon name="check" size={14} />}
      </span>
      {text != null && <span style={{ minWidth: 0 }}>{text}</span>}
    </label>
  );
}
