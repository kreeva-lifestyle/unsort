// Saved Links modal: the per-SKU Dropbox links the module remembers. A link
// typed once in the SKU box is auto-saved after it resolves; here the owner
// can review, add, correct or remove them. On a run, a saved link is used
// automatically — just type the SKU.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import type { ListingSkuLink } from '../../types/database';

export default function SavedLinks({ open, onClose, addToast }: {
  open: boolean;
  onClose: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<ListingSkuLink[]>([]);
  const [sku, setSku] = useState('');
  const [link, setLink] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('listing_sku_links')
      .select('id, sku, link, updated_at').order('sku');
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows((data as ListingSkuLink[] | null) || []);
  }, [addToast]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', open);
    return () => document.body.classList.remove('modal-open');
  }, [open]);
  useEffect(() => { if (open) load(); else { setSku(''); setLink(''); setSearch(''); setSaving(false); setConfirmDel(''); } }, [open, load]);

  if (!open) return null;

  const add = async () => {
    if (saving) return;
    const s = sku.trim().toUpperCase();
    const l = link.trim();
    if (!s || !l) { addToast('Fill both the SKU and its Dropbox link', 'error'); return; }
    if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(l)) { addToast('That is not a Dropbox link', 'error'); return; }
    setSaving(true);
    try {
      const existing = rows.find(r => r.sku === s);
      const payload = { sku: s, link: l, updated_at: new Date().toISOString() };
      const { error } = existing
        ? await supabase.from('listing_sku_links').update(payload).eq('id', existing.id)
        : await supabase.from('listing_sku_links').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id });
      if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      addToast(existing ? 'Link updated' : `Link saved for ${s} — future runs need only the SKU`, 'success');
      setSku(''); setLink('');
      load();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const del = async (id: string) => {
    const { error } = await supabase.from('listing_sku_links').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Link removed', 'success');
    setConfirmDel('');
    load();
  };

  const q = search.trim().toUpperCase();
  const shown = q ? rows.filter(r => r.sku.includes(q)) : rows;

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Saved Links</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
            Each SKU's Dropbox image folder, remembered. Links typed in the SKU box are saved here automatically after a successful run — next time just type the SKU.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU" style={{ ...S.fInput, flex: '1 1 110px', fontFamily: T.mono }} />
            <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="https://www.dropbox.com/…" style={{ ...S.fInput, flex: '2 1 200px', fontFamily: T.mono }} />
            <button onClick={add} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
          {rows.length > 8 && (
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU…" style={{ ...S.fSearch, width: '100%', marginBottom: 8 }} />
          )}
          {rows.length === 0 && (
            <div style={{ padding: '26px 10px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
              No saved links yet — type "SKU link" once in the SKU box (or add one above) and it sticks.
            </div>
          )}
          {shown.length > 0 && (
            <div style={{ maxHeight: '42vh', overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
              {shown.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}` }}>
                  <span style={{ fontSize: 12, fontFamily: T.mono, fontWeight: 600, color: T.tx2, width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.sku}>{r.sku}</span>
                  <span style={{ fontSize: 10, color: T.tx3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.link}>{r.link}</span>
                  {confirmDel === r.id ? (
                    <>
                      <button onClick={() => del(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Confirm</button>
                      <button onClick={() => setConfirmDel('')} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDel(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
