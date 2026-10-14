// The buyer list: every lead the spider has found (this run or all runs),
// with tappable contacts and the outreach status staff keep. Cards on every
// screen size — a lead is eight fields deep, which a table cannot hold on a
// phone. 50 at a time with Load More, like the other Minis lists.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { T, S, alpha } from '../../../../lib/theme';
import { friendlyError } from '../../../../lib/friendlyError';
import Empty from '../../../ui/Empty';
import { LEAD_COLS, STATUS_LABEL, KIND_LABEL, updateLead, type BuyerLead, type BuyerLeadStatus } from './buyerApi';
import { exportLeadsXlsx } from './exportLeads';

const PAGE = 50;
const MAX_ROWS = 1000;   // the list is read in one go; past this the footer says so
const STATUS_COLOR: Record<BuyerLeadStatus, string> = { new: T.ac2, contacted: T.yl, replied: T.bl, customer: T.gr, rejected: T.tx3 };
const scoreColor = (s: number) => (s >= 80 ? T.gr : s >= 65 ? T.yl : T.tx3);

export default function BuyerLeadList({ runId, refreshKey, addToast }: { runId: string | null; refreshKey: number; addToast: (m: string, t?: string) => void }) {
  const [leads, setLeads] = useState<BuyerLead[] | null>(null);
  const [scope, setScope] = useState<'run' | 'all'>('all');
  const [status, setStatus] = useState<'' | BuyerLeadStatus>('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // A new run shows its own buyers first; without a run the whole list.
  useEffect(() => { setScope(runId ? 'run' : 'all'); setLimit(PAGE); }, [runId]);
  // refreshKey bumps on every lead found, so responses can overlap: only the
  // latest request may land, or a stale "this run" reply overwrites "all".
  useEffect(() => {
    let cancelled = false;
    let q = supabase.from('buyer_leads').select(LEAD_COLS).order('score', { ascending: false }).order('created_at', { ascending: false }).limit(MAX_ROWS);
    if (scope === 'run' && runId) q = q.eq('first_run_id', runId);
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error) { addToast(friendlyError(error), 'error'); setLeads([]); return; }
      setLeads((data ?? []) as BuyerLead[]);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, runId, refreshKey]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (leads ?? []).filter(l => (!status || l.status === status)
      && (!q || [l.name, l.domain, l.city, l.country, l.what_they_sell, l.email].some(v => (v || '').toLowerCase().includes(q))));
  }, [leads, status, search]);

  const setLeadStatus = async (l: BuyerLead, next: BuyerLeadStatus) => {
    const { error } = await updateLead(l.id, { status: next });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setLeads(ls => (ls ?? []).map(x => (x.id === l.id ? { ...x, status: next, contacted_at: next === 'contacted' ? new Date().toISOString() : x.contacted_at } : x)));
    addToast(`${l.name || l.domain}: ${STATUS_LABEL[next]}`, 'success');
  };
  const saveNotes = async (l: BuyerLead) => {
    const { error } = await updateLead(l.id, { notes: draft.trim() });
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setLeads(ls => (ls ?? []).map(x => (x.id === l.id ? { ...x, notes: draft.trim() } : x)));
    setNotesFor(null); addToast('Note saved', 'success');
  };

  const link = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer" style={{ color: T.ac2, textDecoration: 'none', fontSize: 11, minHeight: 44, display: 'inline-flex', alignItems: 'center', paddingRight: 10 }}>{text}</a>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {runId && (['run', 'all'] as const).map(s => (
          <button key={s} onClick={() => { setScope(s); setLimit(PAGE); }} style={{ ...(scope === s ? S.btnPrimary : S.btnGhost), minHeight: 44 }}>{s === 'run' ? 'This run' : 'All buyers'}</button>
        ))}
        <select value={status} onChange={e => { setStatus(e.target.value as '' | BuyerLeadStatus); setLimit(PAGE); }} style={{ ...S.fInput, width: 'auto' }}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as BuyerLeadStatus[]).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
        </select>
        <input value={search} onChange={e => { setSearch(e.target.value); setLimit(PAGE); }} placeholder="Search name, city, country…" style={{ ...S.fInput, flex: 1, minWidth: 160 }} />
        {shown.length > 0 && <button onClick={() => exportLeadsXlsx(shown, scope === 'run' ? 'run' : 'all')} style={{ ...S.btnGhost, minHeight: 44 }}>Export {shown.length}</button>}
      </div>

      {leads === null && <div style={{ padding: 30, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading…</div>}
      {leads !== null && shown.length === 0 && (
        <Empty icon="search" title={leads.length ? 'Nothing matches' : 'No buyers yet'} message={leads.length ? 'Try another filter or search.' : 'Start a run from a buyer\'s website above — every site the spider accepts lands here with its contacts.'} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        {shown.slice(0, limit).map(l => (
          <div key={l.id} style={{ border: `1px solid ${T.bd}`, borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span title={`Match ${l.score}/100`} style={{ width: 8, height: 8, borderRadius: '50%', background: scoreColor(l.score), flexShrink: 0 }} />
              <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: T.tx, textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name || l.domain}</a>
              <span style={{ fontSize: 10, fontFamily: T.mono, color: scoreColor(l.score) }}>{l.score}</span>
            </div>
            <div style={{ fontSize: 10.5, color: T.tx3 }}>{l.domain} · {KIND_LABEL[l.kind || ''] || 'Other'}{[l.city, l.country].filter(Boolean).length ? ` · ${[l.city, l.country].filter(Boolean).join(', ')}` : ''}</div>
            {l.what_they_sell && <div style={{ fontSize: 11, color: T.tx2, lineHeight: 1.5 }}>{l.what_they_sell}</div>}
            {l.reason && <div style={{ fontSize: 10.5, color: T.tx3, lineHeight: 1.5 }}>{l.reason}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
              {l.email && link(`mailto:${l.email}`, l.email)}
              {l.phone && link(`tel:${l.phone}`, l.phone)}
              {l.whatsapp && link(`https://wa.me/${l.whatsapp.replace(/\D/g, '')}`, 'WhatsApp')}
              {l.instagram && link(`https://instagram.com/${l.instagram}`, `@${l.instagram}`)}
              {l.facebook && link(`https://facebook.com/${l.facebook}`, 'Facebook')}
              {!l.email && !l.phone && !l.whatsapp && !l.instagram && !l.facebook && <span style={{ fontSize: 10.5, color: T.tx3 }}>No contact found on the site — open it and look for a contact page.</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
              <select value={l.status} onChange={e => setLeadStatus(l, e.target.value as BuyerLeadStatus)} style={{ ...S.fInput, width: 'auto', color: STATUS_COLOR[l.status], borderColor: alpha(STATUS_COLOR[l.status], 0.4) }}>
                {(Object.keys(STATUS_LABEL) as BuyerLeadStatus[]).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
              </select>
              <button onClick={() => { setNotesFor(notesFor === l.id ? null : l.id); setDraft(l.notes || ''); }} style={{ ...S.btnGhost, minHeight: 44 }}>{l.notes ? 'Edit note' : 'Add note'}</button>
              {l.notes && notesFor !== l.id && <span style={{ fontSize: 10.5, color: T.tx2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.notes}</span>}
            </div>
            {notesFor === l.id && (
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveNotes(l); }} placeholder="Who you spoke to, what they said…" style={{ ...S.fInput, flex: 1 }} autoFocus />
                <button onClick={() => saveNotes(l)} style={{ ...S.btnPrimary, minHeight: 44 }}>Save</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {shown.length > limit && <button onClick={() => setLimit(n => n + PAGE)} style={{ width: '100%', padding: '12px', marginTop: 8, border: 'none', background: T.ac3, color: T.ac2, fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 8 }}>Load More ({shown.length - limit} remaining)</button>}
      {leads !== null && leads.length >= MAX_ROWS && <div style={{ fontSize: 10.5, color: T.tx3, textAlign: 'center', marginTop: 8 }}>Showing the top {MAX_ROWS} by match score — narrow with a status or search, or export to Excel for everything in a filter.</div>}
    </div>
  );
}
