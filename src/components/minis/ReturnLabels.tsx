import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import Empty from '../ui/Empty';

interface Label { id: string; label_text: string; label_type: string; qc_person: string | null; created_at: string }

type LabelType = 'return' | 'qc_assured';
const QC_PEOPLE = ['Bhavika', 'Parul', 'Aarti', 'Rekha', 'Sarla', 'Jayshree'];

const esc = (s: unknown) => String(s ?? '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));

const buildPrintHtml = (items: { text: string; type: LabelType; qcPerson: string | null; copies: number }[]): string => {
  const now = new Date();
  const date = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const labels = items.flatMap(it =>
    Array.from({ length: it.copies }, () => {
      const isQc = it.type === 'qc_assured';
      const bannerText = isQc ? 'QC ASSURED' : 'RETURN';
      const bannerBg = isQc ? '#0a6e2e' : '#1a1a1a';
      const borderColor = isQc ? '#0a6e2e' : '#1a1a1a';
      const qcLine = isQc && it.qcPerson ? `<div class="qc-by">QC By: ${esc(it.qcPerson)}</div>` : '';
      return `<div class="label">
  <div class="inner">
    <div class="banner" style="background:${bannerBg}">${isQc ? '&#10003;' : '&#9888;'} ${bannerText}</div>
    <div class="reason" style="border-color:${borderColor}">${esc(it.text.toUpperCase())}</div>
    ${qcLine}
    <div class="footer" style="border-color:${borderColor}">
      <div class="brand">ARYA DESIGNS</div>
      <div class="date">${esc(date)} ${esc(time)}</div>
    </div>
  </div>
</div>`;
    })
  );
  return `<!DOCTYPE html><html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#000}
.label{width:1.97in;height:2.97in;display:flex;align-items:stretch;overflow:hidden;page-break-after:always}
.inner{flex:1;display:flex;flex-direction:column;padding:0}
.banner{background:#1a1a1a;color:#fff;text-align:center;padding:10px 8px;font-size:13pt;font-weight:900;letter-spacing:2px;text-transform:uppercase}
.reason{flex:1;display:flex;align-items:center;justify-content:center;padding:12px 10px;text-align:center;font-size:14pt;font-weight:900;line-height:1.35;word-break:break-word;letter-spacing:0.5px;border-left:4px solid #1a1a1a;border-right:4px solid #1a1a1a}
.qc-by{text-align:center;padding:4px 10px 6px;font-size:9pt;font-weight:700;color:#333;border-left:4px solid #0a6e2e;border-right:4px solid #0a6e2e;letter-spacing:0.5px}
.footer{border-top:2px solid #1a1a1a;padding:6px 10px;display:flex;justify-content:space-between;align-items:center}
.brand{font-size:7pt;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#333}
.date{font-size:6.5pt;color:#555}
@media print{
  @page{margin:0;size:1.97in 2.97in}
  body{margin:0}
  .label{width:100%;height:100%}
}
@media screen{.label{border:1px solid #ccc;margin:8px auto}}
</style></head><body>${labels.join('')}
</body></html>`;
};

export default function ReturnLabels({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [labelType, setLabelType] = useState<LabelType>('return');
  const [qcPerson, setQcPerson] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const printRef = useRef<HTMLIFrameElement | null>(null);

  const fetchLabels = useCallback(async () => {
    const { data, error } = await supabase.from('return_labels').select('id, label_text, label_type, qc_person, created_at').order('created_at', { ascending: false });
    if (error) addToast(friendlyError(error), 'error');
    else setLabels(data || []);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', showModal || !!printHtml || !!confirmDelete);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showModal, printHtml, confirmDelete]);

  const filtered = useMemo(() => {
    if (!search.trim()) return labels;
    const q = search.toLowerCase();
    return labels.filter(l => l.label_text.toLowerCase().includes(q) || (l.qc_person || '').toLowerCase().includes(q));
  }, [labels, search]);

  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  const openAdd = () => { setEditId(null); setText(''); setLabelType('return'); setQcPerson(''); setFormError(''); setShowModal(true); };
  const openEdit = (l: Label) => { setEditId(l.id); setText(l.label_text); setLabelType(l.label_type as LabelType); setQcPerson(l.qc_person || ''); setFormError(''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditId(null); setText(''); setLabelType('return'); setQcPerson(''); setFormError(''); };

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setFormError('Label text is required'); return; }
    if (labelType === 'qc_assured' && !qcPerson) { setFormError('QC person is required'); return; }
    setSaving(true);
    try {
      const row = { label_text: trimmed, label_type: labelType, qc_person: labelType === 'qc_assured' ? qcPerson : null };
      if (editId) {
        const { error } = await supabase.from('return_labels').update(row).eq('id', editId);
        if (error) throw error;
        addToast('Label updated', 'success');
      } else {
        const { error } = await supabase.from('return_labels').insert(row);
        if (error) throw error;
        addToast('Label added', 'success');
      }
      closeModal();
      fetchLabels();
    } catch (e: any) {
      setFormError(friendlyError(e));
    } finally { setSaving(false); }
  };

  const doDelete = async (id: string) => {
    const { error } = await supabase.from('return_labels').delete().eq('id', id);
    if (error) addToast(friendlyError(error), 'error');
    else { addToast('Label deleted', 'success'); fetchLabels(); setPage(0); }
    setConfirmDelete(null);
  };

  const getCopies = (id: string) => copies[id] ?? 1;
  const setCopy = (id: string, n: number) => setCopies(p => ({ ...p, [id]: Math.max(1, Math.min(99, n)) }));

  const printAll = () => {
    const items = filtered.filter(l => getCopies(l.id) > 0).map(l => ({ text: l.label_text, type: l.label_type as LabelType, qcPerson: l.qc_person, copies: getCopies(l.id) }));
    if (items.length === 0) { addToast('Nothing to print', 'error'); return; }
    setPrintHtml(buildPrintHtml(items));
  };

  const printOne = (l: Label) => {
    setPrintHtml(buildPrintHtml([{ text: l.label_text, type: l.label_type as LabelType, qcPerson: l.qc_person, copies: getCopies(l.id) }]));
  };

  const totalCopies = filtered.reduce((s, l) => s + getCopies(l.id), 0);

  const typeBadge = (l: Label) => {
    const isQc = l.label_type === 'qc_assured';
    return (
      <span style={{ ...S.badge, background: isQc ? T.gr22 : T.yl22, color: isQc ? T.gr : T.yl, fontSize: 9 }}>
        {isQc ? 'QC Assured' : 'Return'}
      </span>
    );
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>Loading…</div>;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search labels…" style={S.fSearch} />
        </div>
        <button onClick={openAdd} className="desktop-only" style={S.btnPrimary}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M12 5v14M5 12h14" /></svg>
          Add Label
        </button>
        <button onClick={printAll} disabled={filtered.length === 0} style={{ ...S.btnGhost, opacity: filtered.length === 0 ? 0.3 : 1, pointerEvents: filtered.length === 0 ? 'none' : 'auto' }}>
          <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
          Print All ({totalCopies})
        </button>
      </div>

      {/* Table — desktop */}
      {filtered.length > 0 ? (
        <>
          <div className="desktop-only" style={S.tableWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.thStyle}>Label Text</th>
                <th style={{ ...S.thStyle, width: 100, textAlign: 'center' }}>Type</th>
                <th style={{ ...S.thStyle, width: 100, textAlign: 'center' }}>QC By</th>
                <th style={{ ...S.thStyle, width: 120, textAlign: 'center' }}>Copies</th>
                <th style={{ ...S.thStyle, width: 180, textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>{paged.map(l => (
                <tr key={l.id}>
                  <td style={{ ...S.tdStyle, fontWeight: 600, color: T.tx }}>{l.label_text}</td>
                  <td style={{ ...S.tdStyle, textAlign: 'center' }}>{typeBadge(l)}</td>
                  <td style={{ ...S.tdStyle, textAlign: 'center', fontSize: 12 }}>{l.qc_person || '—'}</td>
                  <td style={{ ...S.tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: `1px solid ${T.bd2}`, borderRadius: 6, overflow: 'hidden' }}>
                      <button onClick={() => setCopy(l.id, getCopies(l.id) - 1)} style={{ width: 30, height: 30, border: 'none', background: T.glass2, color: T.tx2, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>−</button>
                      <span style={{ width: 32, textAlign: 'center', fontSize: 13, fontWeight: 600, color: T.tx, fontFamily: T.mono }}>{getCopies(l.id)}</span>
                      <button onClick={() => setCopy(l.id, getCopies(l.id) + 1)} style={{ width: 30, height: 30, border: 'none', background: T.glass2, color: T.tx2, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>+</button>
                    </div>
                  </td>
                  <td style={{ ...S.tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => printOne(l)} style={{ ...S.btnGhost, ...S.btnSm }}>Print</button>
                      <button onClick={() => openEdit(l)} style={{ ...S.btnGhost, ...S.btnSm }}>Edit</button>
                      <button onClick={() => setConfirmDelete(l.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paged.map(l => (
              <div key={l.id} style={{ background: T.glass1, border: `1px solid ${T.bd}`, borderRadius: 10, padding: '14px 14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {typeBadge(l)}
                  {l.qc_person && <span style={{ fontSize: 11, color: T.tx2 }}>{l.qc_person}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, marginBottom: 10 }}>{l.label_text}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: `1px solid ${T.bd2}`, borderRadius: 6, overflow: 'hidden' }}>
                    <button onClick={() => setCopy(l.id, getCopies(l.id) - 1)} style={{ width: 36, height: 36, border: 'none', background: T.glass2, color: T.tx2, cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>−</button>
                    <span style={{ width: 36, textAlign: 'center', fontSize: 14, fontWeight: 600, color: T.tx, fontFamily: T.mono }}>{getCopies(l.id)}</span>
                    <button onClick={() => setCopy(l.id, getCopies(l.id) + 1)} style={{ width: 36, height: 36, border: 'none', background: T.glass2, color: T.tx2, cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>+</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => printOne(l)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44, padding: '8px 12px' }}>Print</button>
                    <button onClick={() => openEdit(l)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 44, padding: '8px 12px' }}>Edit</button>
                    <button onClick={() => setConfirmDelete(l.id)} style={{ ...S.btnDanger, ...S.btnSm, minHeight: 44, padding: '8px 12px' }}>Del</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>Prev</button>
              <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {Math.max(1, totalPages)}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }}>Next</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: T.tx3 }}>{filtered.length} label{filtered.length !== 1 ? 's' : ''}</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ ...S.fInput, padding: '4px 8px', fontSize: 11, height: 28, borderRadius: 6, width: 'auto', cursor: 'pointer' }}>
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
          </div>
        </>
      ) : (
        <Empty icon="tag" title={search ? 'No labels match your search' : 'No QC labels yet'} message={search ? 'Try a different search term' : 'Add your first QC label to get started'} cta={search ? undefined : 'Add Label'} onCta={search ? undefined : openAdd} />
      )}

      {/* FAB — mobile */}
      <button className="fab" onClick={openAdd} aria-label="Add label">
        <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: 'none', stroke: '#fff', strokeWidth: 2 }}><path d="M12 5v14M5 12h14" /></svg>
      </button>

      {/* Add/Edit Modal */}
      {showModal && createPortal(
        <div style={S.modalOverlay} onClick={closeModal}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <h3 style={S.modalTitle}>{editId ? 'Edit Label' : 'Add QC Label'}</h3>
              <span onClick={closeModal} style={S.modalClose}>&times;</span>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ marginBottom: 12 }}>
                <label style={S.fLabel}>Type</label>
                <select value={labelType} onChange={e => { setLabelType(e.target.value as LabelType); if (e.target.value === 'return') setQcPerson(''); }} style={S.fInput}>
                  <option value="return">Return</option>
                  <option value="qc_assured">QC Assured</option>
                </select>
              </div>
              {labelType === 'qc_assured' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={S.fLabel}>QC Person</label>
                  <select value={qcPerson} onChange={e => setQcPerson(e.target.value)} style={S.fInput}>
                    <option value="">Select person…</option>
                    {QC_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={S.fLabel}>Label Text</label>
                <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} placeholder="e.g. Pant Missing, Product Damage…" style={S.fInput} autoFocus />
              </div>
              {formError && <div style={{ ...S.errorBox, marginTop: 0, marginBottom: 12 }}>{formError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={closeModal} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, flex: 1, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>{saving ? 'Saving…' : editId ? 'Update' : 'Add'}</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirm */}
      {confirmDelete && createPortal(
        <div style={S.modalOverlay} onClick={() => setConfirmDelete(null)}>
          <div className="modal-inner" style={{ ...S.modalBox, maxWidth: 340, padding: '20px 18px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: 6 }}>
              <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: 'none', stroke: T.yl, strokeWidth: 2, strokeLinejoin: 'round' }}><path d="M12 2L2 22h20L12 2z" /><path d="M12 9v5" strokeLinecap="round" /><circle cx="12" cy="17" r=".5" fill={T.yl} /></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.tx, fontFamily: T.sora, marginBottom: 4 }}>Delete Label?</div>
            <div style={{ fontSize: 12, color: T.tx2, marginBottom: 14, lineHeight: 1.5 }}>This label will be permanently removed.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
              <button onClick={() => doDelete(confirmDelete)} style={{ ...S.btnDangerSolid, flex: 1 }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Print Preview */}
      {printHtml && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#060810', display: 'flex', flexDirection: 'column', touchAction: 'none' }}>
          <div style={{ padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.08)', background: 'rgba(8,11,20,.95)', backdropFilter: 'blur(20px)' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', fontFamily: "'Sora',sans-serif" }}>QC Label Preview</span>
              <div style={{ fontSize: 10, color: '#6B7890' }}>{totalCopies} label{totalCopies === 1 ? '' : 's'}</div>
            </div>
            <button onClick={() => setPrintHtml(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: '#8896B0', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Close">&times;</button>
          </div>
          <iframe ref={printRef} title="QC label print preview" srcDoc={printHtml} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
          <div style={{ padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(8,11,20,.95)', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setPrintHtml(null)} style={{ ...S.btnGhost, flex: 1, maxWidth: 200 }}>Close</button>
            <button onClick={() => { printRef.current?.contentWindow?.print(); }} style={{ ...S.btnPrimary, ...S.btnLg, flex: 1, maxWidth: 200, justifyContent: 'center' }}>Print</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
