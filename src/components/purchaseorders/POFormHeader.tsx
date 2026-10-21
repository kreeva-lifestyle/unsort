// The head of the PO form: vendor, type, PO date, expected date, payment
// terms and "for how many pcs" (with Lump sum). On a revision the vendor,
// type and PO date are shown but locked — they stay as raised. Split out of
// POForm so that file stays under the 200-line limit; the form owns the state.
import { T, S } from '../../lib/theme';
import { numericKeyDown } from '../../lib/numericInput';
import VendorPicker from './VendorPicker';
import TopVendorChips from './TopVendorChips';
import DateInput from '../ui/DateInput';
import { PO_TYPES, PO_TYPE_LABELS } from '../../types/database';
import type { PurchaseOrderType } from '../../types/database';

type Vendor = { id: string | null; name: string; phone: string };

export default function POFormHeader({ amend, editing, vendor, onPickVendor, poType, onType, poDate, onPoDate, expectedDate, onExpected, paymentTerms, onTerms, forPieces, onPieces, lumpSum, onLumpSum, piecesMissing, addToast }: {
  amend: boolean; editing: boolean;
  vendor: Vendor; onPickVendor: (v: Vendor) => void;
  poType: PurchaseOrderType | ''; onType: (t: PurchaseOrderType | '') => void;
  poDate: string; onPoDate: (v: string) => void;
  expectedDate: string; onExpected: (v: string) => void;
  paymentTerms: string; onTerms: (v: string) => void;
  forPieces: string; onPieces: (v: string) => void;
  lumpSum: boolean; onLumpSum: (v: boolean) => void;
  /** Save was tried without the piece count: the box shows red. */
  piecesMissing: boolean;
  addToast: (m: string, t?: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={S.fLabel}>Vendor *</label>
        {amend
          ? <div style={{ ...S.fInput, display: 'flex', alignItems: 'center', gap: 8, color: T.tx2 }}><b style={{ color: T.tx }}>{vendor.name}</b>{vendor.phone && <span style={{ fontFamily: T.mono, fontSize: 12, color: T.tx3 }}>{vendor.phone}</span>}</div>
          : <VendorPicker value={vendor.name} phone={vendor.phone} onPick={onPickVendor} addToast={addToast} />}
        {!editing && !vendor.name.trim() && <TopVendorChips onPick={onPickVendor} />}
      </div>
      <div>
        <label style={S.fLabel}>Type *</label>
        <select value={poType} disabled={amend} onChange={e => onType(e.target.value as PurchaseOrderType | '')} style={{ ...S.fInput, color: poType ? T.tx : T.tx3, opacity: amend ? 0.6 : 1 }}>
          <option value="" disabled>Select type…</option>
          {PO_TYPES.map(t => <option key={t} value={t}>{PO_TYPE_LABELS[t]}</option>)}
        </select>
      </div>
      <div>
        <label style={S.fLabel}>PO Date</label>
        <DateInput value={poDate} onChange={e => onPoDate(e.target.value)} disabled={amend} style={{ width: '100%', opacity: amend ? 0.6 : 1 }} />
      </div>
      <div>
        <label style={S.fLabel}>Expected</label>
        <DateInput value={expectedDate} onChange={e => onExpected(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div>
        <label style={S.fLabel}>Payment terms</label>
        <input value={paymentTerms} onChange={e => onTerms(e.target.value)} placeholder="e.g. 30 days" style={S.fInput} />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <label style={S.fLabel}>For how many pcs?{lumpSum ? '' : ' *'}</label>
          {/* The tick makes the count optional: a lump-sum order is priced as a whole. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: lumpSum ? T.ac2 : T.tx3, cursor: 'pointer', minHeight: 24, marginBottom: 6, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
            <input type="checkbox" checked={lumpSum} onChange={e => onLumpSum(e.target.checked)} style={{ accentColor: T.ac, width: 14, height: 14, margin: 0 }} />Lump sum
          </label>
        </div>
        <input value={forPieces} onChange={e => onPieces(e.target.value.replace(/\D/g, ''))} onKeyDown={e => numericKeyDown(e)} inputMode="numeric" placeholder={lumpSum ? 'optional for a lump sum' : 'e.g. 120'} aria-label="For how many pieces" required={!lumpSum}
          style={{ ...S.fInput, fontFamily: T.mono, borderColor: piecesMissing ? 'oklch(0.63 0.22 25 / .5)' : undefined }} />
        <div style={{ fontSize: 10, color: T.tx3, marginTop: 3 }}>{lumpSum ? 'lump sum — priced as a whole; ' : ''}not shown on the shared or printed PO</div>
      </div>
    </div>
  );
}
