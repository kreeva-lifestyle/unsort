import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';

const FROM = { name: 'Arya Designs', city: 'Surat', phone: '+91 63544 82868' };

interface Label { id: string; name: string; phone: string; address: string; city: string; state: string; pincode: string; created_at: string }

const escHtml = (s: string) => s.replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));

const buildLabelHtml = (labels: Label[]) => {
  const cards = labels.map(l => `
    <div class="label">
      <div class="section from">
        <div class="tag">FROM</div>
        <div class="name">${escHtml(FROM.name)}</div>
        <div class="detail">${escHtml(FROM.city)}</div>
        <div class="detail">${escHtml(FROM.phone)}</div>
      </div>
      <div class="divider"></div>
      <div class="section to">
        <div class="tag">TO</div>
        <div class="name">${escHtml(l.name)}</div>
        <div class="detail">${escHtml(l.address)}</div>
        <div class="detail">${escHtml(l.city)}, ${escHtml(l.state)} - ${escHtml(l.pincode)}</div>
        <div class="phone">${escHtml(l.phone)}</div>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Address Labels</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}
.label{width:4in;height:6in;padding:0.4in;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always;border:1px solid #ccc}
.section{flex:1;display:flex;flex-direction:column;justify-content:center}
.from{padding-bottom:0.3in}
.to{padding-top:0.3in}
.divider{border-top:1.5px dashed #999;width:100%}
.tag{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#666;margin-bottom:6px}
.name{font-size:18px;font-weight:700;margin-bottom:4px}
.detail{font-size:13px;color:#333;line-height:1.6}
.phone{font-size:13px;font-weight:600;margin-top:6px;color:#000}
@media print{
  body{margin:0}
  .label{border:none;page-break-after:always}
}
@page{size:4in 6in;margin:0}
</style></head><body>${cards}</body></html>`;
};

export default function AddressPrinter({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showList, setShowList] = useState(false);
  const [addrSearch, setAddrSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', city: '', state: '', pincode: '' });
  const [printHtml, setPrintHtml] = useState<string | null>(null);

  const emptyForm = { name: '', phone: '', address: '', city: '', state: '', pincode: '' };

  const fetchLabels = useCallback(async () => {
    const { data, error } = await supabase.from('address_labels').select('id, name, phone, address, city, state, pincode, created_at').order('created_at', { ascending: false }).limit(500);
    if (error) addToast('Failed to load addresses — ' + friendlyError(error), 'error');
    setLabels(data || []);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) { addToast('All fields are required', 'error'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (editingId) {
      const { error } = await supabase.from('address_labels').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (error) { addToast('Update failed — ' + friendlyError(error), 'error'); setSaving(false); return; }
      addToast('Address updated', 'success');
    } else {
      const { error } = await supabase.from('address_labels').insert({ ...form, created_by: user?.id });
      if (error) { addToast('Save failed — ' + friendlyError(error), 'error'); setSaving(false); return; }
      addToast('Address saved', 'success');
    }
    setSaving(false); setShowAdd(false); setEditingId(null); setForm(emptyForm); fetchLabels();
  };

  const deleteLabel = async (id: string) => {
    const { error } = await supabase.from('address_labels').delete().eq('id', id);
    if (error) { addToast('Delete failed — ' + friendlyError(error), 'error'); return; }
    addToast('Address deleted', 'success'); setSelected(prev => { const n = new Set(prev); n.delete(id); return n; }); fetchLabels();
  };

  const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected(new Set(labels.map(l => l.id)));
  const clearSelection = () => setSelected(new Set());

  const printSingle = (l: Label) => setPrintHtml(buildLabelHtml([l]));
  const printBulk = () => { const toPrint = labels.filter(l => selected.has(l.id)); if (toPrint.length === 0) { addToast('Select addresses to print', 'error'); return; } setPrintHtml(buildLabelHtml(toPrint)); };

  const openEdit = (l: Label) => { setEditingId(l.id); setForm({ name: l.name, phone: l.phone, address: l.address, city: l.city, state: l.state, pincode: l.pincode }); setShowAdd(true); };
  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowAdd(true); };

  if (showList) return (
    <div style={{ animation: 'fi .15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => { setShowList(false); setSelected(new Set()); }} style={{ ...S.btnGhost, padding: '6px 10px', cursor: 'pointer' }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.tx }}>Saved Addresses</span>
          <span style={{ fontSize: 10, color: T.tx3 }}>{labels.length} address{labels.length !== 1 ? 'es' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {selected.size > 0 && <div onClick={printBulk} style={{ ...S.btnGhost, color: T.gr, border: '1px solid rgba(34,197,94,.2)', background: 'rgba(34,197,94,.06)' }}>Print {selected.size} Label{selected.size > 1 ? 's' : ''}</div>}
          <div onClick={openAdd} style={S.btnPrimary}>+ Add Address</div>
        </div>
      </div>

      {labels.length > 0 && <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <span onClick={selected.size === labels.length ? clearSelection : selectAll} style={{ ...S.btnSm, cursor: 'pointer', color: T.ac2, border: `1px solid rgba(99,102,241,.2)`, background: 'rgba(99,102,241,.06)', borderRadius: 5, padding: '4px 10px', fontSize: 10 }}>{selected.size === labels.length ? 'Deselect All' : 'Select All'}</span>
        {selected.size > 0 && <span style={{ fontSize: 10, color: T.tx3 }}>{selected.size} selected</span>}
      </div>}

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
        <input value={addrSearch} onChange={e => setAddrSearch(e.target.value)} placeholder="Search name, city, pincode..." style={S.fSearch} />
      </div>

      {(() => {
        const q = addrSearch.toLowerCase();
        const filtered = q ? labels.filter(l => l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.pincode.includes(q) || l.phone.includes(q) || l.state.toLowerCase().includes(q)) : labels;
        return loading ? <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading...</div> :
        filtered.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>{labels.length === 0 ? 'No saved addresses yet. Click "+ Add Address" to create one.' : 'No matches found.'}</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(l => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: selected.has(l.id) ? 'rgba(99,102,241,.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selected.has(l.id) ? 'rgba(99,102,241,.25)' : T.bd}`, borderRadius: 8, cursor: 'pointer', transition: 'all .15s' }} onClick={() => toggleSelect(l.id)}>
            <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected.has(l.id) ? T.ac : T.bd2}`, background: selected.has(l.id) ? T.ac : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>{selected.has(l.id) && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: '#fff', strokeWidth: 3 }}><path d="M20 6L9 17l-5-5" /></svg>}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{l.name}</div>
              <div style={{ fontSize: 11, color: T.tx2, marginTop: 2 }}>{l.address}, {l.city}, {l.state} - {l.pincode}</div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>{l.phone}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <span onClick={() => printSingle(l)} style={{ ...S.btnSm, cursor: 'pointer', color: T.tx2, border: `1px solid ${T.bd2}`, background: 'rgba(255,255,255,.03)', borderRadius: 5, padding: '5px 10px', fontSize: 10 }}>Print</span>
              <span onClick={() => openEdit(l)} style={{ ...S.btnSm, cursor: 'pointer', color: T.ac2, border: '1px solid rgba(99,102,241,.2)', background: 'rgba(99,102,241,.06)', borderRadius: 5, padding: '5px 10px', fontSize: 10 }}>Edit</span>
              <span onClick={() => deleteLabel(l.id)} style={{ ...S.btnSm, cursor: 'pointer', color: T.re, border: '1px solid rgba(239,68,68,.2)', background: 'rgba(239,68,68,.06)', borderRadius: 5, padding: '5px 10px', fontSize: 10 }}>Del</span>
            </div>
          </div>
        ))}
      </div>;
      })()}

      {/* Add/Edit Modal */}
      {showAdd && createPortal(<div style={S.modalOverlay} onClick={() => { setShowAdd(false); setEditingId(null); }}>
        <div className="modal-inner" style={S.modalBox} onClick={e => e.stopPropagation()}>
          <div style={S.modalHead}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{editingId ? 'Edit' : 'Add'} Address</span>
            <span onClick={() => { setShowAdd(false); setEditingId(null); }} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Recipient name" style={S.fInput} /></div>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Phone *</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 99999 99999" style={S.fInput} /></div>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Address *</label><textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street address, building, area" rows={2} style={{ ...S.fInput, height: 'auto', resize: 'vertical' }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={S.fLabel}>City *</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" style={S.fInput} /></div>
              <div><label style={S.fLabel}>State *</label><input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="State" style={S.fInput} /></div>
            </div>
            <div style={{ marginBottom: 14 }}><label style={S.fLabel}>Pincode *</label><input value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })} placeholder="395006" style={{ ...S.fInput, fontFamily: T.mono }} maxLength={6} /></div>

            {/* Live preview */}
            <div style={{ background: '#fff', color: '#000', borderRadius: 8, padding: 14, marginBottom: 14, border: '1px solid #ddd', fontFamily: 'Arial, sans-serif' }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: '#666', textTransform: 'uppercase', marginBottom: 3 }}>TO</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{form.name || 'Recipient Name'}</div>
              <div style={{ fontSize: 11, color: '#333', lineHeight: 1.6 }}>{form.address || 'Address'}</div>
              <div style={{ fontSize: 11, color: '#333' }}>{form.city || 'City'}, {form.state || 'State'} - {form.pincode || '000000'}</div>
              <div style={{ fontSize: 11, fontWeight: 600, marginTop: 3 }}>{form.phone || 'Phone'}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${T.bd}` }}>
              <span onClick={() => { setShowAdd(false); setEditingId(null); }} style={S.btnGhost}>Cancel</span>
              <span onClick={handleSave} style={{ ...S.btnPrimary, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Save'}</span>
            </div>
          </div>
        </div>
      </div>, document.body)}

      {/* Print Preview */}
      {printHtml && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#060810', display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', fontFamily: T.sora }}>Label Preview</span>
            <button onClick={() => setPrintHtml(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: '#8896B0', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&#215;</button>
          </div>
          <iframe srcDoc={printHtml} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setPrintHtml(null)} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: '#8896B0', fontSize: 13, cursor: 'pointer', fontWeight: 500, flex: 1, maxWidth: 160 }}>Close</button>
            <button onClick={() => { const iframe = document.querySelector('iframe[srcdoc]') as HTMLIFrameElement; iframe?.contentWindow?.print(); }} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366F1, #818CF8)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, flex: 1, maxWidth: 160, boxShadow: '0 4px 16px rgba(99,102,241,.35)' }}>Print</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
