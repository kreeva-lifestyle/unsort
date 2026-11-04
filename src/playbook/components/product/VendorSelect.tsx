// Vendor: pick an existing one or type a new name (saved to pb_vendors on the spot).
import { useState } from 'react';
import { S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { createVendor, type VendorLite } from '../../data/products';

const NEW = '__new__';

export default function VendorSelect({ value, vendors, onChange, onCreated, id }: {
  value: string; vendors: VendorLite[]; onChange: (id: string) => void; onCreated: (v: VendorLite) => void; id?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) { setErr('Type the vendor name'); return; }
    setSaving(true); setErr('');
    try {
      const v = await createVendor(n);
      onCreated(v); onChange(v.id); setAdding(false); setName('');
    } catch (e) { setErr(friendlyError(e)); } finally { setSaving(false); }
  };

  if (adding) return (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input id={id} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="New vendor name" maxLength={120}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} style={{ ...S.fInput, minHeight: 44 }} />
        <button type="button" onClick={save} style={{ ...S.btnPrimary, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Add'}</button>
        <button type="button" onClick={() => { setAdding(false); setErr(''); }} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
      </div>
      {err && <div style={{ ...S.errorBox, marginTop: 6 }}>{err}</div>}
    </div>
  );
  return (
    <select id={id} value={value} onChange={e => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))} style={{ ...S.fInput, minHeight: 44 }}>
      <option value="">— No vendor —</option>
      {vendors.filter(v => v.active || v.id === value).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      <option value={NEW}>+ New vendor…</option>
    </select>
  );
}
