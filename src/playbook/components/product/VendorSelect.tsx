// Vendor: pick an existing one or type a new name (saved to pb_vendors on the spot).
// V2 look: pbInput select; "new vendor" is an input with secondary Add /
// Cancel buttons (the form's own submit stays the one gradient button).
import { useState } from 'react';
import { friendlyError } from '../../../lib/friendlyError';
import { createVendor, type VendorLite } from '../../data/products';
import { pbErrorBox, pbInput } from '../../pbTheme';
import PbButton from '../ui/PbButton';

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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id={id} autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="New vendor name" maxLength={120}
          autoCapitalize="words" enterKeyHint="done" className="pb-input"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }} style={{ ...pbInput, flex: '1 1 180px', width: 'auto' }} />
        <span style={{ display: 'flex', gap: 8, flex: 'none' }}>
          <PbButton onClick={save} busy={saving} busyLabel="Saving…">Add</PbButton>
          <PbButton onClick={() => { setAdding(false); setErr(''); }} dim={saving}>Cancel</PbButton>
        </span>
      </div>
      {err && <div role="alert" style={{ ...pbErrorBox, marginTop: 8 }}>{err}</div>}
    </div>
  );
  return (
    <select id={id} value={value} onChange={e => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))} className="pb-input" style={pbInput}>
      <option value="">— No vendor —</option>
      {vendors.filter(v => v.active || v.id === value).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      <option value={NEW}>+ New vendor…</option>
    </select>
  );
}
