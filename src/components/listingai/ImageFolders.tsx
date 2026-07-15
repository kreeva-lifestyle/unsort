// Image Folders modal: the Dropbox PARENT folder(s) that contain every SKU's
// photo subfolder. Saved once — on each run the module looks up the SKU's
// subfolder inside these, so nothing per-SKU ever needs entering.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import type { ListingFolder } from '../../types/database';

export default function ImageFolders({ open, onClose, addToast }: {
  open: boolean;
  onClose: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<ListingFolder[]>([]);
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('listing_folders')
      .select('id, link, updated_at').order('updated_at', { ascending: false });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRows((data as ListingFolder[] | null) || []);
  }, [addToast]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', open);
    return () => document.body.classList.remove('modal-open');
  }, [open]);
  useEffect(() => { if (open) load(); else { setLink(''); setSaving(false); setConfirmDel(''); } }, [open, load]);

  if (!open) return null;

  const add = async () => {
    if (saving) return;
    const l = link.trim();
    if (!l) { addToast('Paste the Dropbox folder link first', 'error'); return; }
    if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(l)) { addToast('That is not a Dropbox link', 'error'); return; }
    if (rows.some(r => r.link === l)) { addToast('That folder is already saved', 'error'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('listing_folders')
        .insert({ link: l, created_by: (await supabase.auth.getUser()).data.user?.id, updated_at: new Date().toISOString() });
      if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      addToast('Folder saved — SKU photos will be found inside it automatically', 'success');
      setLink('');
      load();
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const del = async (id: string) => {
    const { error } = await supabase.from('listing_folders').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Folder removed', 'success');
    setConfirmDel('');
    load();
  };

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>Image Folders</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: T.tx3, marginBottom: 10, lineHeight: 1.5 }}>
            Paste the Dropbox folder that CONTAINS your SKU folders (e.g. the collection folder). Saved once — every run finds each SKU's subfolder inside these automatically, so you never enter links per SKU.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="https://www.dropbox.com/scl/fo/…" style={{ ...S.fInput, flex: '1 1 260px', fontFamily: T.mono }} />
            <button onClick={add} disabled={saving} style={{ ...S.btnPrimary, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save folder'}</button>
          </div>
          {rows.length === 0 && (
            <div style={{ padding: '26px 10px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
              No folders yet. Until one is saved, photos are searched in the Link Generator folders.
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ maxHeight: '42vh', overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
              {rows.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${T.bd}` }}>
                  <span style={{ fontSize: 10, color: T.tx2, fontFamily: T.mono, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.link}>{r.link}</span>
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
