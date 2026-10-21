// The fabric a job started from a PO carries: each PO line that arrived —
// how much came, how much earlier jobs from it still hold — and how much goes
// to the jobworker with this job (filled with what is free, editable). With
// the switch off the job is created and the fabric goes out later from the
// job page (Send out). Shown in the job form above "Material given".
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import Toggle from '../ui/Toggle';
import { fmtQty, unitOf } from '../purchaseorders/poStats';
import type { MaterialDraft } from './jobworkApi';
import type { PoFabric } from './jobworkFromPo';

export default function PoFabricNote({ poNumber, fabric, mats, onMats, handover, onHandover }: {
  poNumber: number; fabric: PoFabric[];
  mats: MaterialDraft[]; onMats: (next: MaterialDraft[]) => void;
  handover: boolean; onHandover: (on: boolean) => void;
}) {
  const set = (id: string, v: string) => onMats(mats.map(m => (m.po_item_id === id ? { ...m, send_qty: v } : m)));
  return (
    <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 12px', background: T.glass1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ ...S.fLabel, marginBottom: 0 }}>Fabric from PO #{poNumber}</span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: handover ? T.gr : T.tx3, cursor: 'pointer' }}>
          {handover ? 'Given with the job' : 'Give it later'}
          <Toggle size="sm" on={handover} label="Hand the fabric over with the job" onToggle={() => onHandover(!handover)} />
        </label>
      </div>
      {fabric.map(f => {
        const u = unitOf(f.unit), left = Math.max(0, f.received - f.carried);
        const m = mats.find(x => x.po_item_id === f.po_item_id);
        return (
          <div key={f.po_item_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: `1px solid ${T.bd}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: T.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</div>
              <div style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono, marginTop: 2 }}>
                {fmtQty(f.received)} {u} arrived{f.carried > 0 ? ` · ${fmtQty(f.carried)} with other jobs` : ''} · <span style={{ color: left > 0 ? T.gr : T.yl }}>{fmtQty(left)} free</span>
              </div>
            </div>
            {handover && m && (
              <input value={m.send_qty ?? ''} onChange={e => set(f.po_item_id, e.target.value)} onKeyDown={e => numericKeyDown(e)}
                type="number" min="0" inputMode="decimal" placeholder="0" aria-label={`Give now — ${f.label}`} style={{ ...S.fInput, width: 84, fontFamily: T.mono, textAlign: 'right' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
