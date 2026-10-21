// "Start jobwork" on a received fabric PO (owner's ask): the button for the
// detail's footer, the jobs already started from this PO (for its header),
// and the sheets — which design, when the PO bought fabric for several SKUs,
// then the real Jobwork job form filled from the PO (jobworkFromPo). The
// sheets render outside the detail's overlay, so a tap on them never bubbles
// up and closes the order. Only for someone who can open Jobwork.
import { Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { logSwallowed } from '../../lib/errorLogger';
import { canAccessTab } from '../../lib/tabs';
import { useAuth } from '../../hooks/useAuth';
import ActionSheet from '../ui/ActionSheet';
import { JobForm } from '../jobwork/jobworkLazy';
import { prefillFromPo, skusOf, type JobPrefill } from '../jobwork/jobworkFromPo';
import type { PurchaseOrder, PurchaseOrderItem } from '../../types/database';

export type POJob = { id: string; jw_number: number; status: string };
const FABRIC_IN = ['partially_received', 'completed', 'closed'];

export function useStartJobwork({ po, items, onDone, addToast }: {
  po: PurchaseOrder; items: PurchaseOrderItem[];
  /** A job was created: re-read the order (its trail gains the JOBWORK row). */
  onDone: () => void;
  addToast: (m: string, t?: string) => void;
}) {
  const { profile } = useAuth();
  const can = ['admin', 'manager', 'operator'].includes(profile?.role ?? '') && canAccessTab(profile?.role, 'jobwork', profile?.module_access);
  const fabric = po.po_type === 'fabric';
  const eligible = fabric && FABRIC_IN.includes(po.status) && items.some(it => Number(it.received_qty) > 0);
  const [jobs, setJobs] = useState<POJob[] | null>(null);
  const [pick, setPick] = useState<string[] | null>(null);
  const [prefill, setPrefill] = useState<JobPrefill | null>(null);
  const [busy, setBusy] = useState(false);

  // The jobs this PO's fabric went to (best effort: the header line is a pointer, not the record).
  const loadJobs = useCallback(() => {
    if (!fabric) return;
    supabase.from('jobwork_orders').select('id, jw_number, status').eq('po_id', po.id).order('jw_number').then(({ data, error }) => {
      if (error) { logSwallowed('PO jobwork links', error); return; }
      setJobs((data as POJob[] | null) ?? []);
    });
  }, [fabric, po.id]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  const open = async (sku: string) => {
    setBusy(true);
    const r = await prefillFromPo(po, items, sku);
    setBusy(false);
    if (r.error || !r.prefill) { addToast(friendlyError(r.error), 'error'); return; }
    setPrefill(r.prefill);
  };
  const start = () => {
    if (busy) return;
    const skus = skusOf(items);
    if (skus.length > 1) setPick(skus); else if (skus.length === 1) void open(skus[0]);
    else addToast('No SKU on the fabric that arrived — add one with Revise first', 'error');
  };

  const button = can && eligible
    ? <button onClick={start} aria-busy={busy} title="Start a jobwork job with this fabric" style={{ ...S.btnGhost, ...S.btnSm, pointerEvents: busy ? 'none' : 'auto', opacity: busy ? 0.5 : 1 }}>{busy ? 'Opening…' : 'Start jobwork'}</button>
    : null;
  const sheet = (
    <>
      <ActionSheet open={!!pick} title="Which design?" subtitle={`PO #${po.po_number} bought fabric for ${pick?.length ?? 0} SKUs — one job per design`} onClose={() => setPick(null)}
        actions={(pick ?? []).map(s => ({ label: s, onClick: () => { setPick(null); void open(s); } }))} />
      {prefill && (
        <Suspense fallback={null}>
          <JobForm edit={null} prefill={prefill} addToast={addToast} onClose={() => setPrefill(null)} onSaved={() => { setPrefill(null); loadJobs(); onDone(); }} />
        </Suspense>
      )}
    </>
  );
  return { button, sheet, jobs };
}
