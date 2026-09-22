// The SKU map panel for Indya Import (the Virtual Stock shape): the code as
// Indya sent it → the correct code, saved in Supabase, applied before any
// lookup. Codes only, never a size — one entry fixes every size. Hands the
// map up as a Corrections object after every load or write.
import { useState, useEffect, useCallback, useRef } from 'react';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { downloadFile } from '../../../lib/downloadFile';
import { exportName, fileDate } from '../../../lib/exportName';
import { csvCell } from '../../../lib/escape';
import ConfirmModal, { useConfirm } from '../../ui/ConfirmModal';
import SkuInput from '../../ui/SkuInput';
import type { Corrections } from './indyaFiles';
import { loadSkuMap, upsertSkuMap, deleteSkuMap, toCorrections, checkEntry, MAP_LIMIT, type MapRow } from './indyaMap';

export default function IndyaSkuMap({ addToast, onChange, prefill }: {
  addToast: (msg: string, type?: string) => void;
  onChange: (c: Corrections) => void;
  /** { code, n }: open the panel with this code in the first field (n changes on every request). */
  prefill: { code: string; n: number } | null;
}) {
  const [rows, setRows] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [wrong, setWrong] = useState('');
  const [correct, setCorrect] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editId, setEditId] = useState<string | null>(null);
  const [editWrong, setEditWrong] = useState('');
  const [editCorrect, setEditCorrect] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null); // id of the row whose Save / Del is in flight
  const { ask, modalProps } = useConfirm();

  // Callbacks live in refs so `load` is stable: a parent re-render must never
  // reload the map (and clear the computed result) by itself.
  const cb = useRef({ addToast, onChange }); cb.current = { addToast, onChange };
  const load = useCallback(async () => {
    try { const r = await loadSkuMap(); setRows(r); cb.current.onChange(toCorrections(r)); }
    catch (e) { cb.current.addToast('Failed to load the SKU map — ' + friendlyError(e), 'error'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (prefill) { setExpanded(true); setWrong(prefill.code); setCorrect(''); } }, [prefill]);

  const add = async () => {
    const problem = checkEntry(wrong, correct);
    if (problem) { addToast(problem, 'error'); return; }
    setSaving(true);
    try {
      await upsertSkuMap([{ wrong, correct }]);
      addToast(`${wrong.trim().toUpperCase()} → ${correct.trim().toUpperCase()} saved`, 'success');
      setWrong(''); setCorrect(''); await load();
    } catch (e) { addToast('Save failed — ' + friendlyError(e), 'error'); }
    setSaving(false);
  };
  const saveEdit = async (r: MapRow) => {
    const problem = checkEntry(editWrong, editCorrect);
    if (problem || rowBusy) { if (problem) addToast(problem, 'error'); return; }
    setRowBusy(r.id);
    try {
      if (editWrong.trim().toUpperCase() !== r.wrong.toUpperCase()) await deleteSkuMap(r.id);   // the key changed: replace the row
      await upsertSkuMap([{ wrong: editWrong, correct: editCorrect, note: r.note }]);
      setEditId(null); addToast('SKU map updated', 'success'); await load();
    } catch (e) { addToast('Update failed — ' + friendlyError(e), 'error'); }
    setRowBusy(null);
  };
  const remove = async (r: MapRow) => {
    if (rowBusy || !await ask({ title: 'Remove this fix?', message: `${r.wrong} → ${r.correct}`, confirmLabel: 'Remove', danger: true })) return;
    setRowBusy(r.id);
    try { await deleteSkuMap(r.id); addToast('Removed', 'success'); setPage(0); await load(); }
    catch (e) { addToast('Delete failed — ' + friendlyError(e), 'error'); }
    setRowBusy(null);
  };
  const exportCsv = () => {
    if (!rows.length) { addToast('The SKU map is empty', 'error'); return; }
    const csv = ['Code as Indya sent,Correct SKU', ...rows.map(r => `${csvCell(r.wrong)},${csvCell(r.correct)}`)].join('\r\n');
    downloadFile(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), exportName('Indya-SKU-Map', [fileDate()], 'csv'))
      .then(ok => addToast(ok ? `Exported ${rows.length} fixes` : 'Nothing was saved', ok ? 'success' : 'info')).catch(e => addToast(friendlyError(e), 'error'));
  };

  const q = search.trim().toUpperCase();
  const filtered = q ? rows.filter(r => r.wrong.includes(q) || r.correct.includes(q)) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * pageSize, (cur + 1) * pageSize);
  const bt = (style: React.CSSProperties, disabled = false): React.CSSProperties => ({ ...style, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' });

  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <ConfirmModal {...modalProps} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', minHeight: 44 }} onClick={() => setExpanded(e => !e)} role="button" aria-expanded={expanded}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.tx }}>SKU map {rows.length > 0 && <span style={{ fontSize: 10, color: T.tx3, fontWeight: 400 }}>({rows.length} fix{rows.length === 1 ? '' : 'es'})</span>}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 1 }}>Indya’s misspelt codes → the correct code. Codes only, no sizes — one entry fixes every size. Applied to the SKU sheet and the stock lookup.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {expanded && rows.length > 0 && <button type="button" className="touch44" onClick={e => { e.stopPropagation(); exportCsv(); }} style={{ ...S.btnGhost, ...S.btnSm }}>Export</button>}
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: 'none', stroke: T.tx3, strokeWidth: 2, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" /></svg>
        </div>
      </div>

      {expanded && <>
        <div style={{ display: 'flex', gap: 6, marginTop: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <input value={wrong} onChange={e => setWrong(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Code as Indya sent it" aria-label="Code as Indya sent it" style={{ ...S.fInput, flex: 1, minWidth: 140, fontFamily: T.mono, textTransform: 'uppercase' }} />
          <SkuInput value={correct} onChange={setCorrect} sizes={false} placeholder="Correct SKU" style={{ ...S.fInput, flex: 1, minWidth: 140, fontFamily: T.mono, textTransform: 'uppercase' }} onKeyDown={e => { if (e.key === 'Enter') add(); }} aria-label="Correct SKU" />
          <button type="button" className="touch44" onClick={add} style={bt(S.btnPrimary, saving)}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
        {rows.length > 5 && <div style={{ position: 'relative', marginBottom: 8 }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search code…" style={{ ...S.fSearch, width: '100%' }} />
        </div>}
        {loading ? <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: T.tx3 }}>Loading…</div>
        : filtered.length === 0 ? (rows.length === 0 ? <div style={{ fontSize: 11, color: T.tx3, padding: '4px 0' }}>No fixes yet. Add one above, or tap “map” next to an unknown code after Compute.</div> : <div style={{ padding: 12, textAlign: 'center', color: T.tx3, fontSize: 11 }}>No matches</div>)
        : <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {slice.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.01)', border: `1px solid ${T.bd}`, borderRadius: 6, flexWrap: 'wrap' }}>
                {editId === r.id ? (<>
                  <input value={editWrong} onChange={e => setEditWrong(e.target.value)} autoFocus aria-label="Edit code as Indya sent it" style={{ ...S.fInput, flex: 1, minWidth: 110, height: 32, fontSize: 12, fontFamily: T.mono, padding: '4px 8px', textTransform: 'uppercase' }} />
                  <span style={{ color: T.tx3 }}>→</span>
                  <input value={editCorrect} onChange={e => setEditCorrect(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(r); if (e.key === 'Escape') setEditId(null); }} aria-label="Edit correct SKU" style={{ ...S.fInput, flex: 1, minWidth: 110, height: 32, fontSize: 12, fontFamily: T.mono, padding: '4px 8px', textTransform: 'uppercase' }} />
                  <button type="button" className="touch44" onClick={() => saveEdit(r)} style={bt({ ...S.btnSuccess, ...S.btnSm }, rowBusy === r.id)}>{rowBusy === r.id ? 'Saving…' : 'Save'}</button>
                  <button type="button" className="touch44" onClick={() => setEditId(null)} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
                </>) : (<>
                  <div style={{ flex: 1, minWidth: 0, fontFamily: T.mono, fontSize: 12, color: T.tx }}><span style={{ color: T.re, textDecoration: 'line-through', textDecorationColor: 'rgba(239,68,68,.5)' }}>{r.wrong}</span> <span style={{ color: T.tx3 }}>→</span> <b style={{ color: T.gr }}>{r.correct}</b></div>
                  <button type="button" className="touch44" onClick={() => { setEditId(r.id); setEditWrong(r.wrong); setEditCorrect(r.correct); }} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</button>
                  <button type="button" className="touch44" onClick={() => remove(r)} style={bt({ ...S.btnDanger, ...S.btnSm }, rowBusy === r.id)}>{rowBusy === r.id ? 'Deleting…' : 'Del'}</button>
                </>)}
              </div>
            ))}
          </div>
          {rows.length >= MAP_LIMIT && <div style={{ fontSize: 11, color: T.yl, marginTop: 8 }}>Showing the first {MAP_LIMIT} fixes — use search to find more.</div>}
          {filtered.length > pageSize && <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setPage(Math.max(0, cur - 1))} disabled={cur === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur === 0 ? 0.3 : 1 }}>Prev</button>
            <span style={{ fontSize: 10, color: T.tx3 }}>{cur + 1} / {pages}</span>
            <button type="button" onClick={() => setPage(Math.min(pages - 1, cur + 1))} disabled={cur >= pages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: cur >= pages - 1 ? 0.3 : 1 }}>Next</button>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: T.tx3 }}>{filtered.length} fixes</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} aria-label="Fixes per page" style={{ ...S.fInput, padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, width: 'auto' }}>{[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </div>}
        </>}
      </>}
    </div>
  );
}
