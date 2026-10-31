// "Change vendor" under a Raise POs line that has alternate suppliers on the
// costing: lists them (name · material code · rate); picking one makes it the
// default supplier (supplierDefault.ts) and the line moves to that vendor.
import { useState } from 'react';
import { T } from '../../../lib/theme';
import { money, num, type CostingSupplier } from './costingModel';

export default function VendorSwitch({ suppliers, onPick }: {
  suppliers: CostingSupplier[];
  onPick: (k: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // The current one is the selected supplier, else the first (selectedSupplier's rule).
  const cur = Math.max(0, suppliers.findIndex(s => s.selected));
  const others = suppliers.map((s, k) => ({ s, k })).filter(({ s, k }) => s.name.trim() && k !== cur);
  if (others.length === 0) return null;
  const pick = async (k: number) => {
    setBusy(true);
    await onPick(k);
    setBusy(false); setOpen(false);
  };
  return (
    <div style={{ width: '100%' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ border: 'none', background: 'none', color: T.ac2, fontSize: 11, cursor: 'pointer', padding: '6px 0', minHeight: 32 }}>
        {open ? 'Keep this vendor' : `Change vendor (${others.length} more)`}
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>
          {others.map(({ s, k }) => (
            <button key={k} type="button" onClick={() => pick(k)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', minHeight: 44, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,0.02)', color: T.tx, fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: T.sans }}>
              <span style={{ minWidth: 0 }}>{busy ? 'Changing…' : s.name.trim()}{s.materialCode.trim() && <span style={{ color: T.tx3, fontFamily: T.mono }}> · {s.materialCode.trim()}</span>}</span>
              <span style={{ fontFamily: T.mono, color: T.tx2, whiteSpace: 'nowrap' }}>{money(num(s.rate))}</span>
            </button>
          ))}
          <div style={{ fontSize: 10, color: T.tx3 }}>The vendor you pick becomes this item's default on the costing.</div>
        </div>
      )}
    </div>
  );
}
