// Jobwork → Drafts tab: New job forms saved half-filled (jobworkDrafts.ts),
// newest first, with who saved each one last. Tap one to finish it (Create
// job) or discard it. The list's search box narrows them by SKU, jobworker
// or job type.
import { useEffect, useState } from 'react';
import { T } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { fmtWhen } from '../../lib/humanize';
import Empty from '../ui/Empty';
import SkuThumb from '../ui/SkuThumb';
import type { JobworkDraft } from '../../types/database';
import { listDrafts } from './jobworkDrafts';
import { StateDot } from './JobHeader';

export default function JobDrafts({ search, version, onOpen, addToast }: {
  search: string; version: number; onOpen: (d: JobworkDraft) => void; addToast: (m: string, t?: string) => void;
}) {
  const [rows, setRows] = useState<JobworkDraft[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    listDrafts().then(r => {
      if (!live) return;
      if (r.error) { addToast(friendlyError(r.error), 'error'); setRows([]); return; }
      setRows(r.rows); setNames(r.names);
    });
    return () => { live = false; };
  }, [version, addToast]);

  if (rows === null) return <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: T.tx3 }}>Loading drafts…</div>;
  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter(r => [r.form.sku, r.form.vendor_name, r.form.job_type].some(x => (x || '').toLowerCase().includes(q))) : rows;
  if (!shown.length) return q
    ? <Empty icon="search" title="No drafts match" message="Try another search." />
    : <Empty icon="clipboard" title="No drafts" message='Press "Save as draft" on a new job to keep it here and finish it later.' />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 8 }}>
      {shown.map(r => {
        const f = r.form;
        const what = [f.job_type, f.component && f.component.toUpperCase()].filter(Boolean).join(' · ');
        return (
          <div key={r.id} role="button" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r); }} className="jw-card"
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', border: `1px dashed ${T.bd2}`, borderRadius: T.rLg, padding: '12px 14px', cursor: 'pointer', minHeight: 44 }}>
            {f.sku ? <SkuThumb sku={f.sku} size={48} /> : <div style={{ width: 48, height: 48, borderRadius: 8, background: T.glass2, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: f.sku ? T.tx : T.tx3 }}>{f.sku || 'No SKU yet'}</span>
                <span style={{ marginLeft: 'auto' }}><StateDot label="Draft" t="yl" /></span>
              </div>
              <div style={{ fontSize: 12, color: T.tx2, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {what || 'No job type yet'} · <b style={{ color: f.vendor_name ? T.tx : T.tx3, fontWeight: 600 }}>{f.vendor_name || 'no jobworker yet'}</b>
              </div>
              <div style={{ fontSize: 11, color: T.tx3, marginTop: 6 }}>
                {f.pieces ? `${f.pieces} ${f.qty_unit === 'm' ? 'm' : 'pcs'} · ` : ''}Saved {fmtWhen(r.updated_at)}{r.updated_by && names[r.updated_by] ? ` by ${names[r.updated_by]}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
