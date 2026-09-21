// The contact rows: name, phone, role chips, address. Presentational only —
// the parent loads, filters and opens the editor.
import { T } from '../../lib/theme';
import Empty from '../ui/Empty';
import type { ContactRow } from './contactsMerge';

const chip = (bg: string, color: string): React.CSSProperties => ({ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', background: bg, color });
export const ROLE_CHIP = {
  customer: chip('oklch(0.77 0.14 230 / .12)', T.bl),
  supplier: chip('oklch(0.72 0.19 145 / .12)', T.gr),
  inactive: chip('oklch(0.63 0.22 25 / .12)', T.re),
};

export default function ContactList({ rows, total, q, canEdit, onOpen, onNew }: {
  rows: ContactRow[];
  total: number;
  q: string;
  canEdit: boolean;
  onOpen: (c: ContactRow) => void;
  onNew: () => void;
}) {
  if (total === 0) {
    return <Empty icon="handshake" title="No contacts yet" message="Customers are added when a challan is saved and suppliers when a PO is raised — or add one here." cta={canEdit ? '+ New contact' : undefined} onCta={onNew} />;
  }
  if (rows.length === 0) {
    return <div style={{ padding: 36, textAlign: 'center', color: T.tx3, fontSize: 12 }}>No contact matches “{q.trim()}”.</div>;
  }
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.01)', overflow: 'hidden' }}>
      {rows.map((c, i) => (
        <button key={c.key} type="button" onClick={() => onOpen(c)} title={canEdit ? 'Edit contact' : 'View contact'}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '10px 14px', textAlign: 'left', background: 'none', border: 0, borderTop: i ? `1px solid ${T.bd}` : 0, color: T.tx, cursor: 'pointer', font: 'inherit' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: T.ac3, color: T.ac2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sora, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {c.name.trim().charAt(0).toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.active ? T.tx : T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{c.name}</span>
              {c.customerId && <span style={ROLE_CHIP.customer}>Customer</span>}
              {c.vendorId && <span style={ROLE_CHIP.supplier}>Supplier</span>}
              {!c.active && <span style={ROLE_CHIP.inactive}>Inactive</span>}
            </div>
            <div style={{ fontSize: 11, color: T.tx3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.phone ? <span style={{ fontFamily: T.mono, color: T.tx2 }}>{c.phone}</span> : <span>no phone</span>}
              {c.address && <span> · {c.address}</span>}
              {c.gstin && <span> · GSTIN {c.gstin}</span>}
            </div>
          </div>
          <span aria-hidden="true" style={{ color: T.tx3, fontSize: 16, flexShrink: 0 }}>›</span>
        </button>
      ))}
    </div>
  );
}
