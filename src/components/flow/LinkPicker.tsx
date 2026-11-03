// Link a Flow step to a real purchase order or job-work order: shows the
// linked one (number, vendor, status, how much has arrived) with Unlink, or
// a picker. With the pipeline's SKU set, the list opens on the orders raised
// for that design; typing searches every recent order by number or vendor.
import { useEffect, useState } from 'react';
import { T, S } from '../../lib/theme';
import { friendlyError } from '../../lib/friendlyError';
import { searchPOs, searchJobwork, type LinkInfo } from './flowData';
import { useSkuFinds, orderLabel, orderSub } from './skuFinds';

type Hit = { id: string; label: string; sub: string; status: string };

export default function LinkPicker({ kind, sku, linkedId, info, onPick, addToast }: {
  kind: 'po' | 'jobwork';
  /** The pipeline's SKU: its orders are listed first. */
  sku: string | null;
  linkedId: string | null;
  info: LinkInfo | null;
  onPick: (id: string | null) => void;
  addToast: (m: string, t?: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const noun = kind === 'po' ? 'purchase order' : 'job work';
  const { finds } = useSkuFinds(open ? sku : null);
  const forSku = !q.trim() && finds ? finds.orders.filter(o => o.kind === kind) : null;

  useEffect(() => {
    if (!open || (!q.trim() && finds && finds.orders.some(o => o.kind === kind))) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const rows: Hit[] = kind === 'po'
          ? (await searchPOs(q)).map(r => ({ id: r.id, label: `PO #${r.po_number}`, sub: `${r.vendor_name} · ${r.po_type.replace('_', ' ')}`, status: r.status.replace(/_/g, ' ') }))
          : (await searchJobwork(q)).map(r => ({ id: r.id, label: `JW #${r.jw_number}`, sub: [r.vendor_name, r.job_type, r.sku].filter(Boolean).join(' · '), status: r.status }));
        if (alive) setHits(rows);
      } catch (e) { if (alive) addToast(friendlyError(e), 'error'); }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q, open, kind, finds, addToast]);

  if (linkedId && !open) {
    return (
      <div style={{ background: T.glass2, border: `1px solid ${T.bd}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{info?.label ?? `Linked ${noun}`}</span>
        <span style={{ fontSize: 11, color: T.tx3 }}>{[info?.sub, info?.status].filter(Boolean).join(' · ')}</span>
        {info?.of ? <span style={{ fontSize: 11, color: T.tx2 }}>{kind === 'po' ? `Received ${info.got?.toLocaleString('en-IN')} of ${info.of.toLocaleString('en-IN')}` : `${info.got ?? 0} of ${info.of} pcs back OK`}</span> : null}
        <span style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button type="button" onClick={() => setOpen(true)} style={{ ...S.btnGhost, ...S.btnSm, minHeight: 28 }}>Change</button>
          <button type="button" onClick={() => onPick(null)} style={{ ...S.btnSm, minHeight: 28, border: `1px solid ${T.bd2}`, background: T.glass1, color: T.tx3, cursor: 'pointer', fontFamily: T.sans }}>Unlink</button>
        </span>
      </div>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ ...S.btnGhost, width: '100%', minHeight: 36 }}>Link a {noun}</button>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`${kind === 'po' ? 'PO' : 'JW'} number or vendor name`} style={S.fInput} aria-label={`Search ${noun}`} />
      <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
        {forSku && forSku.length > 0 && <div style={{ padding: '6px 10px', fontSize: 10, color: T.tx3, borderBottom: `1px solid ${T.bd}` }}>Made for {finds?.sku} — type to search all</div>}
        {(forSku && forSku.length ? forSku.map(o => ({ id: o.id, label: orderLabel(o), sub: orderSub(o), status: o.status })) : null)?.map(h => (
          <button key={h.id} type="button" onClick={() => { onPick(h.id); setOpen(false); setQ(''); }}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', minHeight: 44, border: 'none', borderBottom: `1px solid ${T.bd}`, background: h.id === linkedId ? T.ac3 : 'transparent', color: T.tx, cursor: 'pointer', textAlign: 'left', fontFamily: T.sans }}>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono }}>{h.label}</span>
              <span style={{ fontSize: 10, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{h.sub}</span>
            </span>
            <span style={{ fontSize: 10, color: T.tx2, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{h.status}</span>
          </button>
        ))}
        {!(forSku && forSku.length) && hits === null && <div style={{ padding: 12, fontSize: 11, color: T.tx3 }}>Searching…</div>}
        {!(forSku && forSku.length) && hits?.length === 0 && <div style={{ padding: 12, fontSize: 11, color: T.tx3 }}>No open {noun} matches.</div>}
        {!(forSku && forSku.length) && hits?.map(h => (
          <button key={h.id} type="button" onClick={() => { onPick(h.id); setOpen(false); setQ(''); }}
            style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', minHeight: 44, border: 'none', borderBottom: `1px solid ${T.bd}`, background: h.id === linkedId ? T.ac3 : 'transparent', color: T.tx, cursor: 'pointer', textAlign: 'left', fontFamily: T.sans }}>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.mono }}>{h.label}</span>
              <span style={{ fontSize: 10, color: T.tx3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.sub}</span>
            </span>
            <span style={{ fontSize: 10, color: T.tx2, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{h.status}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => { setOpen(false); setQ(''); }} style={{ ...S.btnSm, alignSelf: 'flex-end', minHeight: 28, border: `1px solid ${T.bd2}`, background: T.glass1, color: T.tx3, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
    </div>
  );
}
