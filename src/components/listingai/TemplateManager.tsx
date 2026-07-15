// Template manager modal: upload a marketplace sheet → parse its header row
// AND its dropdown datasets (data validations, incl. hidden dataset sheets)
// → mark mandatory fields / add hints → save. The original workbook is kept
// in Storage so exports preserve the marketplace's exact file. Re-saving
// under the same name replaces fields + file — how format changes land.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { parseTemplateFile, isImageColumn } from './templateParse';
import FieldRow from './FieldRow';
import type { ListingTemplate, ListingTemplateField } from '../../types/database';

type Editing = {
  id: string | null; name: string; marketplace: string; fields: ListingTemplateField[];
  sheetName: string; headerRow: number; sheetNames: string[];
  fileBuf: ArrayBuffer | null; fileName: string; // null when editing flags of a saved template
};

export default function TemplateManager({ open, onClose, templates, refresh, addToast }: {
  open: boolean; onClose: () => void; templates: ListingTemplate[]; refresh: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.toggle('modal-open', open);
    return () => document.body.classList.remove('modal-open');
  }, [open]);
  useEffect(() => { if (!open) { setEditing(null); setSaving(false); setConfirmDel(''); } }, [open]);

  if (!open) return null;

  const parseInto = async (buf: ArrayBuffer, fileName: string, keep: Partial<Editing>, pickSheet?: string) => {
    try {
      const p = await parseTemplateFile(buf, pickSheet);
      if (p.fields.length === 0) { addToast('No header row found in that sheet', 'error'); return; }
      const withData = p.fields.filter(f => f.allowed?.length).length;
      if (withData > 0) addToast(`${withData} column(s) have fixed dropdown values — generation will only pick from them`, 'success');
      setEditing({
        id: null, name: fileName.replace(/\.\w+$/, ''), marketplace: '',
        ...keep, fields: p.fields, sheetName: p.sheetName, headerRow: p.headerRow, sheetNames: p.sheetNames,
        fileBuf: buf, fileName,
      });
    } catch { addToast('Could not read that file — check the format', 'error'); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseInto(ev.target?.result as ArrayBuffer, file.name, {});
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const save = async () => {
    if (!editing || saving) return;
    const name = editing.name.trim();
    if (!name) { addToast('Give the template a name', 'error'); return; }
    setSaving(true);
    try {
      const existing = templates.find(t => t.id === editing.id)
        || templates.find(t => t.name.trim().toLowerCase() === name.toLowerCase());
      const payload: Record<string, unknown> = { name, marketplace: editing.marketplace.trim(), fields: editing.fields, updated_at: new Date().toISOString() };
      if (editing.fileBuf) { payload.file_name = editing.fileName; payload.sheet_name = editing.sheetName; payload.header_row = editing.headerRow; }
      let id = existing?.id || '';
      if (existing) {
        const { error } = await supabase.from('listing_templates').update(payload).eq('id', existing.id);
        if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      } else {
        const { data, error } = await supabase.from('listing_templates')
          .insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id }).select('id').single();
        if (error || !data) { addToast(friendlyError(error || 'Save failed'), 'error'); setSaving(false); return; }
        id = data.id;
      }
      if (editing.fileBuf && id) {
        const { error: upErr } = await supabase.storage.from('listing-templates')
          .upload(`${id}.xlsx`, new Blob([editing.fileBuf]), { upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (upErr) addToast(`Template saved, but the original file could not be stored — exports will use a plain sheet. ${friendlyError(upErr)}`, 'error');
      }
      addToast(existing ? 'Template updated' : 'Template saved', 'success');
      refresh();
      setEditing(null);
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setSaving(false);
  };

  const del = async (t: ListingTemplate) => {
    const { error } = await supabase.from('listing_templates').delete().eq('id', t.id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    await supabase.storage.from('listing-templates').remove([`${t.id}.xlsx`]);
    addToast('Template deleted', 'success');
    setConfirmDel('');
    refresh();
  };

  const setField = (i: number, patch: Partial<ListingTemplateField>) =>
    setEditing(ed => ed ? { ...ed, fields: ed.fields.map((f, ix) => ix === i ? { ...f, ...patch } : f) } : ed);

  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={S.modalTitle}>{editing ? (editing.id ? 'Edit Template' : 'New Template') : 'Manage Templates'}</div>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }}>&#215;</span>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          {!editing && <>
            <button onClick={() => fileRef.current?.click()} style={{ ...S.btnPrimary, marginBottom: 12 }}>Upload marketplace sheet</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />
            {templates.length === 0 && (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
                No templates yet — upload the marketplace's blank listing sheet (headers + its dropdown datasets become the template).
              </div>
            )}
            {templates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 6, background: 'rgba(255,255,255,0.01)' }}>
                <div onClick={() => setEditing({ id: t.id, name: t.name, marketplace: t.marketplace, fields: t.fields, sheetName: t.sheet_name || '', headerRow: t.header_row || 0, sheetNames: [], fileBuf: null, fileName: t.file_name || '' })} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>
                    {t.name}
                    {t.marketplace && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600, background: T.ac3, color: T.ac2 }}>{t.marketplace}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: T.tx3, marginTop: 2 }}>
                    {t.fields.length} fields · {t.fields.filter(f => f.allowed?.length).length} with dropdowns · {t.fields.filter(f => f.fixed).length} fixed{t.file_name ? ` · exports into ${t.file_name}` : ''} — tap to edit
                  </div>
                </div>
                {confirmDel === t.id ? (
                  <>
                    <button onClick={() => del(t)} style={{ ...S.btnDanger, ...S.btnSm }}>Confirm</button>
                    <button onClick={() => setConfirmDel('')} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDel(t.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
                )}
              </div>
            ))}
          </>}
          {editing && <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                <div style={S.fLabel}>Template name</div>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') save(); }} placeholder="e.g. Myntra Kurta Set" style={{ ...S.fInput, width: '100%' }} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={S.fLabel}>Marketplace</div>
                <input value={editing.marketplace} onChange={e => setEditing({ ...editing, marketplace: e.target.value })} placeholder="Myntra / Ajio / …" style={{ ...S.fInput, width: '100%' }} />
              </div>
              {editing.fileBuf && editing.sheetNames.length > 1 && (
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={S.fLabel}>Data-entry sheet</div>
                  <select value={editing.sheetName} onChange={e => parseInto(editing.fileBuf!, editing.fileName, { name: editing.name, marketplace: editing.marketplace, id: editing.id }, e.target.value)} style={{ ...S.fInput, width: '100%' }}>
                    {editing.sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 8, lineHeight: 1.5 }}>
              Tick required fields. Columns with a dropdown show an "options" chip (tap to preview). Set a <b>fixed value</b> for anything that's the same on every product (brand, origin, addresses…) — fixed fields are filled instantly and never cost AI tokens. Price-like columns are blanked automatically.
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => {
                const skippable = (f: ListingTemplateField) => !f.mandatory && !f.fixed && !f.skip && !isImageColumn(f.header);
                const n = editing.fields.filter(skippable).length;
                setEditing({ ...editing, fields: editing.fields.map(f => skippable(f) ? { ...f, skip: true } : f) });
                addToast(n ? `${n} non-mandatory column(s) skipped — mandatory, fixed and photo columns kept` : 'Nothing to skip — everything left is mandatory, fixed or a photo column', 'success');
              }} style={{ ...S.btnGhost, ...S.btnSm }}>Skip all non-mandatory</button>
              <button onClick={() => setEditing(ed => ed ? { ...ed, fields: ed.fields.map(f => f.skip ? { ...f, skip: false } : f) } : ed)} style={{ ...S.btnGhost, ...S.btnSm }}>Fill all</button>
              <span style={{ fontSize: 10, color: T.tx3 }}>{editing.fields.filter(f => f.mandatory).length} mandatory · {editing.fields.filter(f => f.skip).length} skipped</span>
            </div>
            <div style={{ maxHeight: '38vh', overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
              {editing.fields.map((f, i) => (
                <FieldRow key={i} f={f} onChange={patch => setField(i, patch)} addToast={addToast} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, flex: 1, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save template'}</button>
              <button onClick={() => setEditing(null)} style={S.btnGhost}>Back</button>
            </div>
          </>}
        </div>
      </div>
    </div>,
    document.body
  );
}
