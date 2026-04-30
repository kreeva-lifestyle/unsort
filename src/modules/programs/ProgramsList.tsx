import { useState } from 'react';
import { T, S } from '../../lib/theme';
import { usePrograms } from './hooks/usePrograms';
import { useT } from './hooks/useT';
import { supabase } from '../../lib/supabase';
import { softDeleteProgram, generateShareToken, fetchMatchings } from './lib/supabase-rpc';
import { getShareUrl } from './lib/share-token';
import { useNotifications } from '../../hooks/useNotifications';
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
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleDelete = async (p: Program) => {
    if (!confirm(t('deleteConfirm'))) return;
    setDeleting(p.id);
    const { error } = await softDeleteProgram(p.id);
    setDeleting(null);
    if (error) { addToast(t('saveFailed'), 'error'); return; }
    addToast(t('deleted'), 'success');
    reload();
    // 5-second undo window
    const undoTimer = setTimeout(() => {}, 5000);
    const undoRestore = async () => {
      clearTimeout(undoTimer);
      await supabase.from('programs').update({ is_deleted: false, updated_at: new Date().toISOString() }).eq('id', p.id);
      addToast(t('restored'), 'success');
      reload();
    };
    // Show undo toast (auto-dismiss after 5s)
    addToast(`${p.program_uid} deleted. Tap to undo.`, 'info');
    // Store undo handler for the next 5 seconds
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-toast]')) { undoRestore(); document.removeEventListener('click', handler); }
    };
    document.addEventListener('click', handler);
    setTimeout(() => document.removeEventListener('click', handler), 5000);
  };

  const handleCopyLink = async (p: Program) => {
    let token = p.share_token;
    if (!token) {
      const { token: newToken, error } = await generateShareToken(p.id);
      if (error || !newToken) { addToast(t('shareLinkFailed'), 'error'); return; }
      token = newToken;
    }
    const url = getShareUrl(token);
    try { await navigator.clipboard.writeText(url); addToast(t('copied'), 'success'); } catch { addToast(url, 'info'); }
  };

  const handleEdit = async (p: Program) => {
    const { data } = await fetchMatchings(p.id);
    onEdit(p, data.map(m => ({ company_name: m.company_name, matching_label: m.matching_label || '' })));
  };

  const th: React.CSSProperties = { ...S.thStyle, padding: '10px 12px', fontSize: 10 };
  const td: React.CSSProperties = { ...S.tdStyle, padding: '10px 12px', fontSize: 12 };
  const ghostBtn: React.CSSProperties = { ...S.btnGhost, ...S.btnSm, cursor: 'pointer' };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>{t('title')}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={toggleLang} style={{ ...ghostBtn, gap: 4 }}>
            {lang === 'en' ? 'ગુ' : 'EN'}
          </button>
          <button onClick={onAdd} style={S.btnPrimary}>{t('addProgram')}</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <input
          value={search} onChange={e => onSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          style={{ flex: 1, ...S.fInput, fontSize: 12, padding: '8px 12px', height: 36 }}
        />
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd2}`, borderRadius: 6, color: T.tx, fontSize: 10, padding: '6px 6px', outline: 'none', width: 50 }}>
          <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
        </select>
      </div>

      <div style={{ fontSize: 9, color: T.tx3, marginBottom: 6 }}>{totalCount} {t('records')}</div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
        {loading && <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>{t('loading')}</div>}
        {!loading && programs.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{search ? '🔍' : '📋'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 6 }}>{search ? t('noResults') : t('noPrograms')}</div>
            <div style={{ fontSize: 11, color: T.tx3, marginBottom: 12 }}>{search ? t('noResultsHint') : t('noProgramsHint')}</div>
            {!search && <button onClick={onAdd} style={{ ...S.btnPrimary, cursor: 'pointer' }}>{t('addProgram')}</button>}
          </div>
        )}
        {!loading && programs.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('programUid')}</th>
                <th style={th}>{t('sellingSku')}</th>
                <th style={th}>{t('manufacturingSku')}</th>
                <th style={th}>{t('fabricMeterCol')}</th>
                <th style={th}>{t('workTotalCol')}</th>
                <th style={th}>{t('updatedAt')}</th>
                <th style={th}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {programs.map(p => (
                <tr key={p.id} style={{ transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ ...td, fontFamily: T.mono, color: T.ac2, fontWeight: 600, cursor: 'pointer' }} onClick={() => onView(p)}>{p.program_uid}</td>
                  <td style={{ ...td, fontFamily: T.mono }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {p.selling_sku || '—'}
                      {p.voice_note_path && <span title="Voice note attached"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: T.bl, strokeWidth: 2, flexShrink: 0 }}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" /></svg></span>}
                    </span>
                  </td>
                  <td style={{ ...td, fontFamily: T.mono }}>{p.manufacturing_sku || '—'}</td>
                  <td style={{ ...td, fontFamily: T.mono, color: T.bl, fontWeight: 600 }}>
                    {priceSummaries[p.id] ? priceSummaries[p.id].fabricMeter.toFixed(2) + ' m' : '—'}
                  </td>
                  <td style={{ ...td, fontFamily: T.mono, color: T.gr, fontWeight: 600 }}>
                    {priceSummaries[p.id] ? '₹' + priceSummaries[p.id].workTotal.toLocaleString('en-IN') : '—'}
                  </td>
                  <td style={{ ...td, fontSize: 10, color: T.tx3 }}>
                    {new Date(p.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <div className="prg-list-actions" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <span onClick={() => handleEdit(p)} style={ghostBtn}>{t('edit')}</span>
                      <span onClick={() => onPDF(p)} style={{ ...ghostBtn, padding: '4px 6px' }} title="PDF"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg></span>
                      <span onClick={() => handleCopyLink(p)} style={{ ...ghostBtn, padding: '4px 6px' }} title="Copy Link"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg></span>
                      <span onClick={() => handleDelete(p)} style={{ ...S.btnDanger, ...S.btnSm, cursor: 'pointer', padding: '4px 6px', opacity: deleting === p.id ? 0.5 : 1 }} title="Delete"><svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg></span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
            style={{ ...ghostBtn, opacity: page === 0 ? 0.3 : 1 }}>{t('prev')}</button>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{ ...ghostBtn, opacity: page >= totalPages - 1 ? 0.3 : 1 }}>{t('next')}</button>
        </div>
      )}
    </div>
  );
}
