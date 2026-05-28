import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/friendlyError';
import { T, S } from '../../lib/theme';
import type { ShortLink } from '../../types/database';
import ShortNTrackAnalytics from './ShortNTrackAnalytics';

const EDGE_BASE = 'https://ulphprdnswznfztawbvg.supabase.co/functions/v1/short-track';
const COLS = 'id, short_code, long_url, title, clicks, created_by, created_at, updated_at';

function generateCode(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function ShortNTrack({ addToast }: { addToast: (msg: string, type?: string) => void }) {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ long_url: '', title: '', short_code: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [analyticsLink, setAnalyticsLink] = useState<ShortLink | null>(null);

  useEffect(() => {
    document.body.classList.toggle('modal-open', showAdd);
    return () => { document.body.classList.remove('modal-open'); };
  }, [showAdd]);

  const fetchLinks = useCallback(async () => {
    const { data, error } = await supabase.from('short_links').select(COLS).order('created_at', { ascending: false }).limit(500);
    if (error) addToast(friendlyError(error), 'error');
    setLinks(data || []);
    setLoading(false);
  }, [addToast]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const handleSave = async () => {
    setFormError('');
    if (!form.long_url.trim()) { setFormError('URL is required'); return; }
    try { new URL(form.long_url.trim()); } catch { setFormError('Invalid URL format'); return; }
    const code = form.short_code.trim() || generateCode();
    if (code.length < 3) { setFormError('Short code must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(code)) { setFormError('Short code: letters, numbers, hyphens, underscores only'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (editingId) {
      const { error } = await supabase.from('short_links').update({ long_url: form.long_url.trim(), title: form.title.trim() || null, short_code: code, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      addToast('Link updated', 'success');
    } else {
      const { error } = await supabase.from('short_links').insert({ long_url: form.long_url.trim(), title: form.title.trim() || null, short_code: code, created_by: user?.id });
      if (error) { addToast(friendlyError(error), 'error'); setSaving(false); return; }
      addToast('Short link created', 'success');
    }
    setSaving(false); closeModal(); fetchLinks();
  };

  const deleteLink = async (id: string) => {
    const { error } = await supabase.from('short_links').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    addToast('Link deleted', 'success'); setPage(0); fetchLinks();
  };

  const copyLink = (code: string) => { navigator.clipboard.writeText(`${EDGE_BASE}/${code}`); addToast('Short link copied', 'success'); };
  const closeModal = () => { setShowAdd(false); setEditingId(null); setForm({ long_url: '', title: '', short_code: '' }); setFormError(''); };
  const openEdit = (l: ShortLink) => { setEditingId(l.id); setForm({ long_url: l.long_url, title: l.title || '', short_code: l.short_code }); setFormError(''); setShowAdd(true); };
  const openAdd = () => { setEditingId(null); setForm({ long_url: '', title: '', short_code: generateCode() }); setFormError(''); setShowAdd(true); };

  const q = search.toLowerCase();
  const filtered = q ? links.filter(l => l.short_code.toLowerCase().includes(q) || l.long_url.toLowerCase().includes(q) || (l.title || '').toLowerCase().includes(q)) : links;
  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);

  // ── Analytics sub-view ────────────────────────────────────────────────────
  if (analyticsLink) return <ShortNTrackAnalytics link={analyticsLink} onBack={() => setAnalyticsLink(null)} addToast={addToast} />;

  // ── List View ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 12, gap: 6 }}>
        <div onClick={openAdd} style={S.btnPrimary}>+ New Link</div>
      </div>

      {links.length > 0 && <div style={{ position: 'relative', marginBottom: 10 }}>
        <svg viewBox="0 0 24 24" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, fill: 'none', stroke: T.tx3, strokeWidth: 1.8, opacity: 0.5 }}><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" /></svg>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search links..." style={S.fSearch} />
      </div>}

      {loading ? <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>Loading...</div> :
      filtered.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: T.tx3, fontSize: 12 }}>{links.length === 0 ? 'No short links yet. Click "+ New Link" to create one.' : 'No matches found.'}</div> :
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {paged.map(l => (
          <div key={l.id} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '12px 14px', transition: 'border-color .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.bd; }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {l.title && <div style={{ fontSize: 13, fontWeight: 600, color: T.tx, marginBottom: 2 }}>{l.title}</div>}
                <div style={{ fontSize: 12, fontFamily: T.mono, color: T.ac2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => copyLink(l.short_code)} title="Click to copy">
                  {EDGE_BASE}/{l.short_code}
                </div>
                <div style={{ fontSize: 10, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.long_url}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: 6, background: T.ac3, minWidth: 48, flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.sora, color: T.ac2 }}>{l.clicks}</div>
                <div style={{ fontSize: 7, color: T.tx3, textTransform: 'uppercase', letterSpacing: 0.5 }}>clicks</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              <span onClick={() => copyLink(l.short_code)} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer' }}>Copy</span>
              <span onClick={() => { setAnalyticsLink(l); window.history.pushState({ view: 'short-analytics' }, ''); }} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer', color: T.gr, borderColor: 'rgba(34,197,94,.2)' }}>Analytics</span>
              <span onClick={() => openEdit(l)} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer' }}>Edit</span>
              <span onClick={() => deleteLink(l.id)} style={{ ...S.btnDanger, ...S.btnSm, cursor: 'pointer' }}>Delete</span>
              <span style={{ fontSize: 9, color: T.tx3, marginLeft: 'auto', alignSelf: 'center' }}>
                {l.created_at ? new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
              </span>
            </div>
          </div>
        ))}
      </div>}

      {totalPages > 1 && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span onClick={() => setPage(Math.max(0, page - 1))} style={{ ...S.btnGhost, ...S.btnSm, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.3 : 1 }}>Prev</span>
          <span style={{ fontSize: 10, color: T.tx3 }}>{page + 1} / {totalPages}</span>
          <span onClick={() => setPage(Math.min(totalPages - 1, page + 1))} style={{ ...S.btnGhost, ...S.btnSm, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.3 : 1 }}>Next</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: T.tx3 }}>{filtered.length} links</span>
          <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ padding: '4px 8px', fontSize: 11, height: 28, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, outline: 'none' }}>
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/page</option>)}
          </select>
        </div>
      </div>}

      {showAdd && createPortal(<div style={S.modalOverlay} onClick={closeModal}>
        <div className="modal-inner" style={S.modalBox} onClick={e => e.stopPropagation()}>
          <div style={S.modalHead}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.tx }}>{editingId ? 'Edit' : 'Create'} Short Link</span>
            <span onClick={closeModal} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18, lineHeight: 1 }} aria-label="Close">&#215;</span>
          </div>
          <form onSubmit={e => { e.preventDefault(); handleSave(); }} style={{ padding: 16 }}>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Destination URL *</label><input value={form.long_url} onChange={e => setForm({ ...form, long_url: e.target.value })} placeholder="https://example.com/long-page" style={S.fInput} /></div>
            <div style={{ marginBottom: 10 }}><label style={S.fLabel}>Title (optional)</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="My Campaign Link" style={S.fInput} /></div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.fLabel}>Short Code</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input value={form.short_code} onChange={e => setForm({ ...form, short_code: e.target.value })} placeholder="abc123" style={{ ...S.fInput, fontFamily: T.mono }} />
                <span onClick={() => setForm({ ...form, short_code: generateCode() })} style={{ ...S.btnGhost, ...S.btnSm, cursor: 'pointer', whiteSpace: 'nowrap' }}>Random</span>
              </div>
              <div style={{ fontSize: 10, color: T.tx3, marginTop: 4, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{EDGE_BASE}/{form.short_code || '...'}</div>
            </div>
            {formError && <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re, marginBottom: 10 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: `1px solid ${T.bd}` }}>
              <span onClick={closeModal} style={S.btnGhost}>Cancel</span>
              <button type="submit" style={{ ...S.btnPrimary, opacity: saving ? 0.5 : 1, pointerEvents: saving ? 'none' : 'auto' }}>{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
            </div>
          </form>
        </div>
      </div>, document.body)}
    </div>
  );
}
