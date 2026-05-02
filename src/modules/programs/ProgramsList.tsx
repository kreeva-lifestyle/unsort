import { useState } from 'react';
import { T, S } from '../../lib/theme';
import SwipeRow from '../../components/ui/SwipeRow';
import { usePrograms } from './hooks/usePrograms';
import { useT } from './hooks/useT';
import { supabase } from '../../lib/supabase';
import { softDeleteProgram, generateShareToken, fetchMatchings } from './lib/supabase-rpc';
import { getShareUrl } from './lib/share-token';
import { useNotifications } from '../../hooks/useNotifications';
import ConfirmModal, { useConfirm } from '../../components/ui/ConfirmModal';
import type { Program } from './types';

interface Props {
  onAdd: () => void;
  onEdit: (p: Program, matchings: { company_name: string; matching_label: string }[]) => void;
  onView: (p: Program) => void;
  onPDF: (p: Program) => void;
}

export default function ProgramsList({ onAdd, onEdit, onView, onPDF }: Props) {
  const { t, lang, toggleLang } = useT();
  const { programs, priceSummaries, loading, search, onSearch, page, setPage, pageSize, setPageSize, totalCount, reload } = usePrograms();
  const { addToast } = useNotifications();
  const [deleting, setDeleting] = useState<string | null>(null);
  const { ask, modalProps } = useConfirm();
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleDelete = async (p: Program) => {
    if (!await ask({ title: t('deleteConfirm'), confirmLabel: t('deleteAction'), danger: true })) return;
    setDeleting(p.id);
    const { error } = await softDeleteProgram(p.id);
    setDeleting(null);
    if (error) { addToast(t('saveFailed'), 'error'); return; }
    addToast(t('deleted'), 'success');
    reload();
    addToast(`${p.program_uid} deleted. Tap to undo.`, 'info');
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-toast]')) { supabase.from('programs').update({ is_deleted: false, updated_at: new Date().toISOString() }).eq('id', p.id).then(() => { addToast(t('restored'), 'success'); reload(); }); document.removeEventListener('click', handler); }
    };
    document.addEventListener('click', handler);
    setTimeout(() => document.removeEventListener('click', handler), 5000);
  };

  const handleCopyLink = async (p: Program) => {
    let token = p.share_token;
    if (!token) { const { token: newToken, error } = await generateShareToken(p.id); if (error || !newToken) { addToast(t('shareLinkFailed'), 'error'); return; } token = newToken; }
    const url = getShareUrl(token);
    try { await navigator.clipboard.writeText(url); addToast(t('copied'), 'success'); } catch { addToast(url, 'info'); }
  };

  const handleEdit = async (p: Program) => {
    const { data } = await fetchMatchings(p.id);
    onEdit(p, data.map(m => ({ company_name: m.company_name, matching_label: m.matching_label || '' })));
  };

  const relTime = (d: string) => {
    const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const iconBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.bd}`, background: 'transparent', color: T.tx2, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: T.transition };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: T.sora, fontSize: 24, fontWeight: 700, color: T.tx, letterSpacing: -0.5 }}>{t('title')}</div>
          <div style={{ fontSize: 12, color: T.tx3, marginTop: 3 }}>{totalCount} recipes · stitching + fabric breakdown per SKU</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={toggleLang} style={{ ...S.btnGhost, ...S.btnSm }}>{lang === 'en' ? 'ગુ' : 'EN'}</button>
          <button onClick={onAdd} style={S.btnPrimary}>{t('addProgram')}</button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search UID, SKU, brand, label…" style={{ ...S.fSearch, background: 'transparent', border: 'none' }} />
        </div>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }} style={{ background: 'transparent', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontSize: 11, padding: '4px 8px', outline: 'none', width: 48, height: 28 }}>
          <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>{t('loading')}</div>}
        {!loading && programs.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.85 }}>{search ? '🔍' : '📋'}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 6 }}>{search ? t('noResults') : t('noPrograms')}</div>
            <div style={{ fontSize: 12, color: T.tx3, marginBottom: 14 }}>{search ? t('noResultsHint') : t('noProgramsHint')}</div>
            {!search && <button onClick={onAdd} style={S.btnPrimary}>{t('addProgram')}</button>}
          </div>
        )}
        {/* Mobile card view */}
        {!loading && programs.length > 0 && (
          <div className="prg-list-mobile" style={{ display: 'none' }}>
            {programs.map((p, idx) => (
              <SwipeRow key={p.id} hint={idx === 0} actions={[
                { label: 'Edit', color: '#3B82F6', onClick: () => handleEdit(p) },
                { label: 'PDF', color: '#6366F1', onClick: () => onPDF(p) },
                { label: 'Del', color: '#EF4444', onClick: () => handleDelete(p) },
              ]}>
              <div onClick={() => onView(p)} style={{ padding: '14px', borderBottom: `1px solid ${T.bd}`, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ac2, fontWeight: 600 }}>{p.program_uid}</span>
                    {p.voice_note_path && <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.yl, strokeWidth: 2 }}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg>}
                  </div>
                  <span style={{ fontSize: 10, color: T.tx3 }}>{relTime(p.updated_at)}</span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 12, color: T.tx, fontWeight: 500 }}>{p.selling_sku || '—'}</div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, marginTop: 1 }}>{p.manufacturing_sku || '—'}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: T.bl, fontFamily: T.mono, fontWeight: 600 }}>{priceSummaries[p.id] ? priceSummaries[p.id].fabricMeter.toFixed(2) + ' m' : '—'}</span>
                  <span style={{ fontSize: 11, color: T.gr, fontFamily: T.mono, fontWeight: 600 }}>{priceSummaries[p.id] ? '₹' + priceSummaries[p.id].workTotal.toLocaleString('en-IN') : '—'}</span>
                </div>
              </div>
              </SwipeRow>
            ))}
          </div>
        )}
        {/* Desktop table */}
        {!loading && programs.length > 0 && (
          <div className="prg-list-desktop">
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead><tr>
              <th style={S.thStyle}>{t('programUid')}</th>
              <th style={S.thStyle}>Selling · Manufacturing</th>
              <th style={{ ...S.thStyle, textAlign: 'right' }}>{t('fabricMeterCol')}</th>
              <th style={{ ...S.thStyle, textAlign: 'right' }}>{t('workTotalCol')}</th>
              <th style={S.thStyle}>{t('updatedAt')}</th>
              <th style={{ ...S.thStyle, textAlign: 'right' }}>{t('actions')}</th>
            </tr></thead>
            <tbody>
              {programs.map(p => (
                <tr key={p.id} style={{ transition: 'background .1s', cursor: 'pointer' }}
                  onClick={() => onView(p)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={S.tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ac2, fontWeight: 600 }}>{p.program_uid}</span>
                      {p.voice_note_path && <span title="Voice note"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.yl, strokeWidth: 2, flexShrink: 0 }}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg></span>}
                    </div>
                  </td>
                  <td style={S.tdStyle}>
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.tx, fontWeight: 500 }}>{p.selling_sku || '—'}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, marginTop: 2 }}>{p.manufacturing_sku || '—'}</div>
                  </td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.bl, fontWeight: 600, textAlign: 'right' }}>
                    {priceSummaries[p.id] ? priceSummaries[p.id].fabricMeter.toFixed(2) + ' m' : '—'}
                  </td>
                  <td style={{ ...S.tdStyle, fontFamily: T.mono, color: T.gr, fontWeight: 600, textAlign: 'right' }}>
                    {priceSummaries[p.id] ? '₹' + priceSummaries[p.id].workTotal.toLocaleString('en-IN') : '—'}
                  </td>
                  <td style={S.tdStyle}>
                    <div style={{ fontSize: 11, color: T.tx3 }}>{relTime(p.updated_at)}</div>
                  </td>
                  <td style={{ ...S.tdStyle, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => handleEdit(p)} style={{ ...iconBtn, color: T.ac2, borderColor: 'rgba(99,102,241,.25)' }} title="Edit"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2 2 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                      <button onClick={() => onPDF(p)} style={iconBtn} title="PDF"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg></button>
                      <button onClick={() => handleCopyLink(p)} style={iconBtn} title="Share link"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg></button>
                      <button onClick={() => handleDelete(p)} style={{ ...iconBtn, color: T.re, borderColor: 'rgba(239,68,68,.25)', opacity: deleting === p.id ? 0.5 : 1 }} title="Delete"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <span onClick={() => setPage(p => Math.max(0, p - 1))} style={{ ...S.btnGhost, ...S.btnSm, opacity: page === 0 ? 0.3 : 1, pointerEvents: page === 0 ? 'none' : 'auto' }}>{t('prev')}</span>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <span onClick={() => setPage(p => p + 1)} style={{ ...S.btnGhost, ...S.btnSm, opacity: page >= totalPages - 1 ? 0.3 : 1, pointerEvents: page >= totalPages - 1 ? 'none' : 'auto' }}>{t('next')}</span>
        </div>
      )}
      <ConfirmModal {...modalProps} />
    </div>
  );
}
