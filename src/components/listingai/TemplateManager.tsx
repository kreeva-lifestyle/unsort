// Template manager modal: upload a marketplace sheet → headers + dropdown
// datasets become the template; the original workbook goes to Storage so
// exports preserve the exact file. Re-uploading a sheet for an existing
// template MERGES: the owner's per-column settings survive, the
// marketplace's changes are applied and summarised.
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { fetchMasterColumns } from './api';
import { parseTemplateFile } from './templateParse';
import { mergeTemplateFields, describeMerge, pruneRules } from './mergeFields';
import FieldRow from './FieldRow';
import EditorToolbar from './EditorToolbar';
import EditorMeta from './EditorMeta';
import RulesEditor from './RulesEditor';
import TemplateListRow from './TemplateListRow';
import type { ListingTemplate, ListingTemplateField, ListingTemplateRule } from '../../types/database';

type Editing = {
  id: string | null; name: string; marketplace: string; fields: ListingTemplateField[];
  rules: ListingTemplateRule[];
  sheetName: string; headerRow: number; sheetNames: string[];
  fileBuf: ArrayBuffer | null; fileName: string; // null when editing flags of a saved template
};

export default function TemplateManager({ open, onClose, templates, refresh, addToast }: {
  open: boolean; onClose: () => void; templates: ListingTemplate[]; refresh: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [mergeInfo, setMergeInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');
  const [masterCols, setMasterCols] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.toggle('modal-open', open);
    return () => document.body.classList.remove('modal-open');
  }, [open]);
  useEffect(() => { if (!open) { setEditing(null); setMergeInfo(''); setSaving(false); setConfirmDel(''); setShowRules(false); } }, [open]);
  // Master headers for the ⤓ pairing select — best-effort, once per open.
  useEffect(() => {
    if (!open || !editing || masterCols.length) return;
    fetchMasterColumns().then(setMasterCols).catch(() => setMasterCols([]));
  }, [open, editing, masterCols.length]);

  if (!open) return null;

  const parseInto = async (buf: ArrayBuffer, fileName: string, pickSheet?: string) => {
    try {
      const p = await parseTemplateFile(buf, pickSheet);
      if (p.fields.length === 0) { addToast('No header row found in that sheet', 'error'); return; }
      // Re-upload for the open template — or a file named like a saved one —
      // MERGES: ticks/fixed/skips/hints survive; the sheet's changes land.
      const base = fileName.replace(/\.\w+$/, '').trim();
      const target = editing?.id ? templates.find(t => t.id === editing.id)
        : templates.find(t => t.name.trim().toLowerCase() === base.toLowerCase());
      let fields = p.fields, info = '';
      // Rules survive a re-upload; targets whose column vanished are dropped.
      const pr = pruneRules(editing?.rules ?? target?.rules ?? [], p.fields);
      if (target) {
        const m = mergeTemplateFields(editing?.id ? editing.fields : target.fields, p.fields);
        fields = m.fields;
        info = describeMerge(m.summary) + (pr.dropped ? `; ${pr.dropped} rule target(s) dropped (column gone)` : '');
        addToast(`Sheet changes merged into "${target.name}"`, 'success');
      } else {
        const withData = p.fields.filter(f => f.allowed?.length).length;
        if (withData > 0) addToast(`${withData} column(s) have fixed dropdown values — generation will only pick from them`, 'success');
      }
      setMergeInfo(info);
      setEditing({
        id: target?.id ?? null,
        name: editing?.name || target?.name || base,
        marketplace: editing?.marketplace || target?.marketplace || '',
        fields, rules: pr.rules, sheetName: p.sheetName, headerRow: p.headerRow, sheetNames: p.sheetNames,
        fileBuf: buf, fileName,
      });
    } catch { addToast('Could not read that file — check the format', 'error'); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => parseInto(ev.target?.result as ArrayBuffer, file.name);
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
      const payload: Record<string, unknown> = { name, marketplace: editing.marketplace.trim(), fields: editing.fields, rules: editing.rules, updated_at: new Date().toISOString() };
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
      setMergeInfo('');
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
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }} />
          {!editing && <>
            <button onClick={() => fileRef.current?.click()} style={{ ...S.btnPrimary, marginBottom: 12 }}>Upload marketplace sheet</button>
            {templates.length === 0 && (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: T.tx3, fontSize: 12 }}>
                No templates yet — upload the marketplace's blank listing sheet (headers + its dropdown datasets become the template).
              </div>
            )}
            {templates.map(t => (
              <TemplateListRow key={t.id} t={t} confirming={confirmDel === t.id}
                onOpen={() => { setMergeInfo(''); setEditing({ id: t.id, name: t.name, marketplace: t.marketplace, fields: t.fields, rules: t.rules || [], sheetName: t.sheet_name || '', headerRow: t.header_row || 0, sheetNames: [], fileBuf: null, fileName: t.file_name || '' }); }}
                onAskDelete={() => setConfirmDel(t.id)} onCancelDelete={() => setConfirmDel('')} onDelete={() => del(t)} />
            ))}
          </>}
          {editing && <>
            <EditorMeta name={editing.name} marketplace={editing.marketplace} sheetName={editing.sheetName} sheetNames={editing.sheetNames} hasFile={!!editing.fileBuf}
              onPatch={p => setEditing(ed => ed ? { ...ed, ...p } : ed)}
              onPickSheet={s => parseInto(editing.fileBuf!, editing.fileName, s)} onEnter={save} />
            {mergeInfo && (
              <div style={{ background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: T.bl, marginBottom: 8, lineHeight: 1.5 }}>
                Sheet update merged: {mergeInfo}
              </div>
            )}
            {showRules ? (
              <RulesEditor fields={editing.fields} masterCols={masterCols} rules={editing.rules}
                onChange={rules => setEditing(ed => ed ? { ...ed, rules } : ed)} onBack={() => setShowRules(false)} />
            ) : <>
              <div style={{ fontSize: 11, color: T.tx3, marginBottom: 8, lineHeight: 1.5 }}>
                Tick required fields. Columns with a dropdown show an "options" chip (tap to preview). Set a <b>fixed value</b> for anything that's the same on every product — fixed fields fill instantly and never cost AI tokens. Fixed values can use {'{sku}'} / {'{size}'} (e.g. {'{sku}-{size}'} → XYZ-XS on each size row) and {'{today}'} for the current date (e.g. an addedDate column → today's date, never ask the AI for a date). Price-like columns are never AI-written — set a fixed value, pair, wire or skip them; left unset they export empty.
              </div>
              <EditorToolbar fields={editing.fields} isSaved={!!editing.id}
                onFields={fields => setEditing(ed => ed ? { ...ed, fields } : ed)}
                onReupload={() => fileRef.current?.click()} addToast={addToast}
                rulesCount={editing.rules.length} onRules={() => setShowRules(true)} />
              <div style={{ maxHeight: '38vh', overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
                {editing.fields.map((f, i) => (
                  <FieldRow key={i} f={f} onChange={patch => setField(i, patch)} addToast={addToast} masterCols={masterCols} others={editing.fields.filter(o => o.header !== f.header && !o.sameAs && !o.skip).map(o => o.header)} />
                ))}
              </div>
            </>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, flex: 1, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save template'}</button>
              <button onClick={() => { setEditing(null); setMergeInfo(''); setShowRules(false); }} style={S.btnGhost}>Back</button>
            </div>
          </>}
        </div>
      </div>
    </div>,
    document.body
  );
}
