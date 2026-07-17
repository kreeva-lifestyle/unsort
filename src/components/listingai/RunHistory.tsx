// Recent generation runs (last 5 days). Each run reopens into the results
// table and can be exported again — the export writes into the template's
// stored workbook, so a reopened run produces the same file. Rows older
// than 5 days are purged by a pg_cron job; the query filters on created_at
// too so nothing older ever displays between purge runs.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import type { ListingRun, ListingTemplate } from '../../types/database';
import type { RunTpl } from './useGenerateRun';

const fiveDaysAgo = () => new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function RunHistory({ templates, refreshKey, onOpen, addToast }: {
  templates: ListingTemplate[];
  refreshKey: number; // bumped after each saved run
  onOpen: (run: ListingRun, tpl: RunTpl) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [runs, setRuns] = useState<ListingRun[]>([]);
  const [opening, setOpening] = useState('');
  const [confirmDel, setConfirmDel] = useState('');
  const [deleting, setDeleting] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('listing_runs')
      .select('id, template_id, template_name, created_at, ok_count, sku_count, est_usd')
      .gte('created_at', fiveDaysAgo())
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) { addToast(friendlyError(error), 'error'); return; }
    setRuns((data as ListingRun[] | null) || []);
  }, [addToast]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const open = async (r: ListingRun) => {
    if (opening) return;
    setOpening(r.id);
    try {
      const { data, error } = await supabase.from('listing_runs')
        .select('id, template_id, template_name, est_usd, headers, kinds, rows, usage, created_at')
        .eq('id', r.id).single();
      if (error || !data) { addToast(friendlyError(error || 'Run not found'), 'error'); setOpening(''); return; }
      const run = data as ListingRun;
      // Prefer the live template (real workbook export); a deleted template
      // falls back to a bare ref → plain-sheet export still works.
      const tpl = templates.find(t => t.id === run.template_id);
      onOpen(run, tpl || { id: run.template_id || '', name: run.template_name, file_name: null as unknown as string, sheet_name: null as unknown as string, header_row: 0 });
    } catch (e) { addToast(friendlyError(e), 'error'); }
    setOpening('');
  };

  const del = async (id: string) => {
    if (deleting) return;
    setDeleting(id);
    const { error } = await supabase.from('listing_runs').delete().eq('id', id);
    if (error) { addToast(friendlyError(error), 'error'); setDeleting(''); return; }
    addToast('Run deleted', 'success');
    setConfirmDel('');
    setDeleting('');
    load();
  };

  if (runs.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.tx, fontFamily: T.sora, marginBottom: 6 }}>
        Recent runs <span style={{ fontSize: 10, color: T.tx3, fontWeight: 400 }}>— kept for 5 days, then deleted automatically</span>
      </div>
      <div style={{ border: `1px solid ${T.bd}`, borderRadius: 10, background: 'rgba(255,255,255,0.01)', overflow: 'hidden' }}>
        {runs.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: T.tx2, fontWeight: 600, flex: 1, minWidth: 140 }}>{r.template_name}</span>
            <span style={{ fontSize: 10, color: T.tx3 }}>{fmtWhen(r.created_at)}</span>
            <span style={{ fontSize: 10, color: T.tx3, fontFamily: T.mono }}>{r.ok_count ?? 0} row(s)</span>
            {Number(r.est_usd) > 0 && <span style={{ fontSize: 10, color: T.gr, fontFamily: T.mono }}>${Number(r.est_usd).toFixed(3)}</span>}
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => open(r)} disabled={!!opening}
                style={{ ...S.btnGhost, ...S.btnSm, color: T.ac2, pointerEvents: opening ? 'none' : 'auto', opacity: opening === r.id ? 0.5 : 1 }}>
                {opening === r.id ? 'Opening…' : 'Open'}
              </button>
              {confirmDel === r.id ? (
                <>
                  <button onClick={() => del(r.id)} disabled={!!deleting}
                    style={{ ...S.btnDanger, ...S.btnSm, pointerEvents: deleting ? 'none' : 'auto', opacity: deleting === r.id ? 0.5 : 1 }}>
                    {deleting === r.id ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDel('')} disabled={!!deleting} style={{ ...S.btnGhost, ...S.btnSm }}>Cancel</button>
                </>
              ) : (
                <button onClick={() => setConfirmDel(r.id)} style={{ ...S.btnDanger, ...S.btnSm }}>Delete</button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
