// New / edit job. Jobworker comes from the Purchase Orders vendor master
// (quick-add included); picking the SKU looks up its costing sheet, whose
// components become chips — choosing one offers its outside-work rate
// (JOBWORK ₹523…) and fills the fabric lines with their usage per piece.
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { T, S } from '../../../lib/theme';
import { friendlyError } from '../../../lib/friendlyError';
import { numericKeyDown } from '../../../lib/numericInput';
import { useModalLock } from '../../../hooks/useModalLock';
import { useBackClose } from '../../../hooks/useBackClose';
import VendorPicker from '../../purchaseorders/VendorPicker';
import SkuInput from '../../ui/SkuInput';
import SuggestInput from '../../ui/SuggestInput';
import DateInput from '../../ui/DateInput';
import MaterialRows from './MaterialRows';
import { JOB_TYPES, today, inr, type JobDetail } from './jobworkModel';
import { saveJob, costingFor, type JobDraft, type MaterialDraft, type CostingRef } from './jobworkApi';
import { componentNames, rateHints, materialHints } from './jobworkCosting';

const blank = (): JobDraft => ({ vendor_id: null, vendor_name: '', vendor_phone: '', job_type: '', sku: '', component: '', costing_product_id: null, pieces: '', rate: '', job_date: today(), expected_date: '', notes: '' });

export default function JobForm({ edit, onClose, onSaved, addToast }: {
  edit: JobDetail | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  addToast: (m: string, t?: string) => void;
}) {
  useModalLock();
  useBackClose(true, onClose);
  const j = edit?.job;
  const [d, setD] = useState<JobDraft>(() => j ? {
    vendor_id: j.vendor_id, vendor_name: j.vendor_name, vendor_phone: j.vendor_phone ?? '', job_type: j.job_type, sku: j.sku,
    component: j.component ?? '', costing_product_id: j.costing_product_id, pieces: String(j.pieces), rate: String(j.rate),
    job_date: j.job_date, expected_date: j.expected_date ?? '', notes: j.notes ?? '',
  } : blank());
  const [mats, setMats] = useState<MaterialDraft[]>(() => (edit?.materials ?? []).filter(m => !m.removed)
    .map(m => ({ id: m.id, name: m.name, unit: m.unit, per_piece: m.per_piece == null ? '' : String(m.per_piece) })));
  const locked = useMemo(() => new Set(edit?.entries.flatMap(e => e.jobwork_entry_lines.map(l => l.material_id)) ?? []), [edit]);
  const [costing, setCosting] = useState<CostingRef | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const patch = (p: Partial<JobDraft>) => { setD(x => ({ ...x, ...p })); setError(''); };

  // Look the SKU's costing sheet up once the code settles.
  useEffect(() => {
    const sku = d.sku.trim();
    if (sku.length < 3) { setCosting(null); return; }
    const t = setTimeout(async () => {
      const { costing: c, error: err } = await costingFor(sku);
      if (err) { addToast(friendlyError(err), 'error'); return; }
      setCosting(c);
      setD(x => ({ ...x, costing_product_id: c?.id ?? null }));
    }, 350);
    return () => clearTimeout(t);
  }, [d.sku, addToast]);

  const comps = costing ? componentNames(costing.components) : [];
  const hints = costing && d.component ? rateHints(costing.components, d.component) : [];
  const fromCosting = costing && d.component ? materialHints(costing.components, d.component) : [];
  const missing = fromCosting.filter(f => !mats.some(m => m.name.trim().toLowerCase() === f.name.toLowerCase()));
  const pickComponent = (c: string) => {
    patch({ component: c });
    if (!costing) return;
    // A fresh job takes the component's fabric lines straight away; an
    // existing one gets the "add from costing" button instead.
    if (!edit && mats.every(m => !m.name.trim())) setMats(materialHints(costing.components, c));
    const h = rateHints(costing.components, c);
    if (h.length === 1 && !d.rate.trim()) patch({ component: c, rate: String(h[0].rate) });
  };

  const submit = async () => {
    if (saving) return;
    if (!d.vendor_name.trim()) return setError('Pick the jobworker');
    if (!d.sku.trim()) return setError('Enter the SKU');
    if (!d.job_type.trim()) return setError('Pick the type of job');
    if (!/^\d+$/.test(d.pieces.trim()) || Number(d.pieces) <= 0) return setError('Pieces must be a whole number above 0');
    if (d.expected_date && d.expected_date < d.job_date) return setError('Expected back cannot be before the job date');
    const rows = mats.filter(m => m.name.trim());
    setSaving(true);
    const { id, error: err } = await saveJob(j?.id ?? null, d, rows);
    setSaving(false);
    if (err || !id) { setError(friendlyError(err)); return; }
    addToast(j ? `JW #${j.jw_number} updated` : 'Job created', 'success');
    onSaved(id);
  };

  const chip = (on: boolean): React.CSSProperties => ({ ...S.btnGhost, ...S.btnSm, minHeight: 32, borderRadius: 999, padding: '5px 12px', fontSize: 11, ...(on ? { borderColor: T.ac, color: T.ac2, background: T.ac3 } : {}) });
  const field = (label: string, req: boolean, node: React.ReactNode) => (
    <div style={{ minWidth: 0 }}><label style={S.fLabel}>{label} {req && <span style={{ color: T.re }}>*</span>}</label>{node}</div>
  );
  return createPortal(
    <div style={S.modalOverlay} onClick={onClose}>
      <div className="modal-inner" style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{j ? `Edit JW #${j.jw_number}` : 'New job'}</span>
          <button type="button" onClick={onClose} style={S.modalClose} aria-label="Close">&#215;</button>
        </div>
        <div style={{ padding: '14px 18px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
          // Enter saves from the number fields only — in the suggestion boxes
          // (jobworker, SKU, job type) Enter picks the highlighted entry.
          onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).type === 'number') { e.preventDefault(); submit(); } }}>
          {field('Jobworker', true, <VendorPicker value={d.vendor_name} phone={d.vendor_phone} addToast={addToast}
            onPick={v => patch({ vendor_id: v.id, vendor_name: v.name, vendor_phone: v.phone })} />)}
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('SKU', true, <SkuInput value={d.sku} sizes={false} onChange={v => patch({ sku: v.toUpperCase() })}
              onPick={(_p, _s, full) => patch({ sku: full })} style={{ ...S.fInput, width: '100%', textTransform: 'uppercase', fontFamily: T.mono }} />)}
            {field('Type of job', true, <SuggestInput value={d.job_type} onChange={v => patch({ job_type: v })} options={JOB_TYPES}
              placeholder="e.g. Embroidery" style={{ ...S.fInput, width: '100%' }} />)}
          </div>
          <div>
            <label style={S.fLabel}>Component sent</label>
            {comps.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {comps.map(c => <button key={c} type="button" onClick={() => pickComponent(c)} style={chip(d.component.toLowerCase() === c.toLowerCase())}>{c.toUpperCase()}</button>)}
              </div>
            ) : (
              <input value={d.component} onChange={e => patch({ component: e.target.value })} placeholder="e.g. LEHANGA, TOP, DUPATTA" style={{ ...S.fInput, width: '100%' }} />
            )}
            <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{costing ? `From the ${costing.sku} costing sheet` : d.sku.trim().length >= 3 ? 'No costing sheet for this SKU — type the component' : ''}</div>
          </div>
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('Pieces', true, <input value={d.pieces} onChange={e => patch({ pieces: e.target.value })} onKeyDown={e => numericKeyDown(e)}
              type="number" min="1" inputMode="numeric" placeholder="0" style={{ ...S.fInput, width: '100%' }} />)}
            {field('Rate per piece (₹)', false, <input value={d.rate} onChange={e => patch({ rate: e.target.value })} onKeyDown={e => numericKeyDown(e)}
              type="number" min="0" inputMode="decimal" placeholder="0" style={{ ...S.fInput, width: '100%' }} />)}
          </div>
          {hints.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: -4 }}>
              <span style={{ fontSize: 10, color: T.tx3 }}>Costing rate:</span>
              {hints.map(h => <button key={h.label} type="button" onClick={() => patch({ rate: String(h.rate) })} style={chip(Number(d.rate) === h.rate)}>{h.label} {inr(h.rate)}</button>)}
            </div>
          )}
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {field('Job date', true, <DateInput value={d.job_date} max={today()} onChange={e => patch({ job_date: e.target.value })} style={{ width: '100%' }} />)}
            {field('Expected back', false, <DateInput value={d.expected_date} min={d.job_date} onChange={e => patch({ expected_date: e.target.value })} style={{ width: '100%' }} />)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <label style={{ ...S.fLabel, marginBottom: 0 }}>Material given</label>
              <span style={{ fontSize: 10, color: T.tx3 }}>unit · usage per piece</span>
              {missing.length > 0 && edit && <button type="button" onClick={() => setMats([...mats.filter(m => m.name.trim()), ...missing])} style={{ ...chip(false), marginLeft: 'auto' }}>+ {missing.length} from costing</button>}
            </div>
            <MaterialRows rows={mats} onChange={setMats} locked={locked} suggestions={fromCosting.map(f => f.name)} />
          </div>
          {field('Notes', false, <textarea value={d.notes} onChange={e => patch({ notes: e.target.value })} rows={2} placeholder="Design, colour, special instructions…"
            style={{ ...S.fInput, width: '100%', height: 'auto', minHeight: 60, resize: 'vertical', lineHeight: 1.5 }} />)}
          {error && <div style={S.errorBox}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...S.btnGhost, minHeight: 44 }}>Cancel</button>
            <button type="button" onClick={submit} style={{ ...S.btnPrimary, flex: 1, minHeight: 44, pointerEvents: saving ? 'none' : 'auto', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : j ? 'Save changes' : 'Create job'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
