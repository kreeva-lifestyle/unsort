import { useState, useEffect, useMemo, useCallback } from 'react';
import { T, S } from '../../lib/theme';
import SectionTitle from './components/SectionTitle';
import FabricBreakdown from './components/FabricBreakdown';
import MatchingCompanyRepeater from './components/MatchingCompanyRepeater';
import { fetchLookup, addLookup } from './lib/supabase-rpc';
import { useTableNav } from './hooks/useTableNav';
import type { ProgramFormData, Program, PricePartRow } from './types';
import { EMPTY_WORK_PART, EMPTY_FABRIC_PART } from './types';
import type { TranslationKey } from './i18n/en';

interface Props {
  form: ProgramFormData;
  setField: <K extends keyof ProgramFormData>(key: K, value: ProgramFormData[K]) => void;
  editing: Program | null;
  error: string;
  saving: boolean;
  onSave: (workParts: PricePartRow[], fabricParts: PricePartRow[]) => void;
  onClose: () => void;
  t: (key: TranslationKey) => string;
  initialWorkParts?: PricePartRow[];
  initialFabricParts?: PricePartRow[];
}

export default function ProgramForm({ form, setField, editing, error, saving, onSave, onClose, t, initialWorkParts, initialFabricParts }: Props) {
  const isSkuError = error === 'skuRequired';
  const [workParts, setWorkParts] = useState<PricePartRow[]>(initialWorkParts?.length ? initialWorkParts : [{ ...EMPTY_WORK_PART }]);
  const [fabricParts, setFabricParts] = useState<PricePartRow[]>(initialFabricParts?.length ? initialFabricParts : [{ ...EMPTY_FABRIC_PART }]);
  const [partNames, setPartNames] = useState<string[]>([]);
  const [fabricNames, setFabricNames] = useState<string[]>([]);
  const [brandNames, setBrandNames] = useState<string[]>([]);
  const [showFB, setShowFB] = useState(false);
  const workNav = useTableNav('work-tbl');
  const fabricNav = useTableNav('fabric-tbl');

  useEffect(() => {
    Promise.all([fetchLookup('program_lookup_part_names'), fetchLookup('program_lookup_fabric_names'), fetchLookup('program_lookup_brands')])
      .then(([pn, fn, bn]) => { setPartNames(pn); setFabricNames(fn); setBrandNames(bn); })
      .catch(() => {});
  }, []);

  const updateWork = useCallback((i: number, field: keyof PricePartRow, value: string | number) => {
    setWorkParts(prev => {
      const next = [...prev]; const row = { ...next[i], [field]: value };
      if (field === 'stitch_type' || field === 'stitch') {
        const stitch = Number(row.stitch);
        if (row.stitch_type === 'meter') row.one_rs = Math.round((stitch * 2.5 / 1000) * 100) / 100;
        else if (row.stitch_type === 'piece') row.one_rs = Math.round((stitch / 1000) * 100) / 100;
        row.one_mp = Math.round(Number(row.one_rs) * Number(row.stitch_rate));
        row.total = Math.round(row.one_mp * Number(row.meter_per_pcs) * 100) / 100;
      }
      if (field === 'one_rs' || field === 'stitch_rate') {
        row.one_mp = Math.round(Number(row.one_rs) * Number(row.stitch_rate));
        row.total = Math.round(row.one_mp * Number(row.meter_per_pcs) * 100) / 100;
      }
      if (field === 'meter_per_pcs') row.total = Math.round(Number(row.one_mp) * Number(value) * 100) / 100;
      next[i] = row; return next;
    });
  }, []);
  const updateFabric = useCallback((i: number, field: keyof PricePartRow, value: string | number) => {
    setFabricParts(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
  }, []);

  const workGT = workParts.reduce((s, p) => s + Number(p.total || 0), 0);
  const workFM = workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricFM = fabricParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fbItems = useMemo(() => {
    const map: Record<string, number> = {};
    [...workParts, ...fabricParts].forEach(p => { const n = (p.fabric_name || '').trim(); const m = Number(p.fabric_meter || 0); if (n && m) map[n] = (map[n] || 0) + m; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [workParts, fabricParts]);

  const handleSave = async () => {
    for (const p of [...workParts, ...fabricParts]) {
      if (p.part_name && !partNames.includes(p.part_name)) await addLookup('program_lookup_part_names', p.part_name);
      if (p.fabric_name && !fabricNames.includes(p.fabric_name)) await addLookup('program_lookup_fabric_names', p.fabric_name);
    }
    for (const m of form.matchings) { if (m.matching_label && !brandNames.includes(m.matching_label)) await addLookup('program_lookup_brands', m.matching_label); }
    onSave(workParts, fabricParts);
  };

  const th: React.CSSProperties = { ...S.thStyle, padding: '8px 8px', fontSize: 10 };
  const td: React.CSSProperties = { padding: '6px 6px', borderBottom: `1px solid ${T.bd}` };
  const numIn: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 11, padding: '6px 6px', outline: 'none', textAlign: 'right' as const, boxSizing: 'border-box' as const };
  const txtIn: React.CSSProperties = { ...numIn, textAlign: 'left' as const };
  const selIn: React.CSSProperties = { ...numIn, textAlign: 'left' as const, appearance: 'none' as const, WebkitAppearance: 'none' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%236B7890'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', paddingRight: 18, cursor: 'pointer' };
  const calcCell: React.CSSProperties = { ...td, fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.ac2, textAlign: 'right' as const, background: 'rgba(255,255,255,0.02)' };

  return (
    <div className="prg-form-overlay" style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)', padding: '20px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="prg-form-modal modal-inner" style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: 0, maxWidth: 900, width: '100%', margin: '20px 0' }} onClick={e => e.stopPropagation()}>
        <div className="prg-form-head" style={{ ...S.modalHead, position: 'sticky', top: 0, zIndex: 2, background: 'rgba(14,18,30,.98)', borderRadius: '14px 14px 0 0' }}>
          <span style={S.modalTitle}>{editing ? t('editTitle') : t('addTitle')}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: T.tx3, fontSize: 18 }}>&times;</span>
        </div>
        <div className="prg-form-body" style={{ padding: '0 20px 20px' }}>
          <SectionTitle color={T.ac2}>{t('programInfo')}</SectionTitle>
          <div className="prg-sku-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><label style={S.fLabel}>{t('sellingSkuLabel')}</label><input value={form.selling_sku} onChange={e => setField('selling_sku', e.target.value)} placeholder={t('skuPlaceholderSell')} style={{ ...S.fInput, fontSize: 11, borderColor: isSkuError && !form.selling_sku ? T.re : undefined }} /></div>
            <div><label style={S.fLabel}>{t('manufacturingSkuLabel')}</label><input value={form.manufacturing_sku} onChange={e => setField('manufacturing_sku', e.target.value)} placeholder={t('skuPlaceholderMfg')} style={{ ...S.fInput, fontSize: 11, borderColor: isSkuError && !form.manufacturing_sku ? T.re : undefined }} /></div>
          </div>
          {isSkuError && <div style={{ ...S.errorBox, marginBottom: 10 }}>{t('skuRequired')}</div>}
          <div style={{ marginBottom: 12 }}><label style={S.fLabel}>{t('linkLabel')}</label><input value={form.dropbox_gdrive_link} onChange={e => setField('dropbox_gdrive_link', e.target.value)} placeholder={t('linkPlaceholder')} style={{ ...S.fInput, fontSize: 11 }} /></div>

          <SectionTitle color={T.gr}>{t('workProgram')}</SectionTitle>
          <div className="prg-table-wrap" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 10, marginBottom: 6 }}>
            <table id="work-tbl" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead><tr>
                <th style={th}>{t('partName')}</th><th style={{ ...th, width: 70 }}>{t('stitch')}</th><th style={{ ...th, width: 68 }}>{t('stitchType')}</th><th style={{ ...th, width: 72 }}>{t('oneRs')}</th>
                <th style={{ ...th, width: 78 }}>{t('stitchRate')}</th><th style={{ ...th, width: 58 }}>{t('oneMP')}</th><th style={{ ...th, width: 72 }}>{t('meterPerPcs')}</th>
                <th style={{ ...th, width: 68 }}>{t('rate')}</th><th style={{ ...th, width: 78 }}>{t('total')}</th><th style={th}>{t('fabricName')}</th>
                <th style={{ ...th, width: 80 }}>{t('fabricMeter')}</th><th style={{ ...th, width: 24 }}></th>
              </tr></thead>
              <tbody>
                {workParts.map((p, i) => (
                  <tr key={i}>
                    <td style={td}><input list="dl-pn" value={p.part_name} onChange={e => updateWork(i, 'part_name', e.target.value)} placeholder={t('partPlaceholder')} style={txtIn} data-row={i} data-col={0} onKeyDown={workNav} /></td>
                    <td style={td}><input type="number" min="0" value={p.stitch || ''} onChange={e => updateWork(i, 'stitch', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={1} onKeyDown={workNav} /></td>
                    <td style={td}><select value={p.stitch_type || 'meter'} onChange={e => updateWork(i, 'stitch_type', e.target.value)} style={{ ...selIn, color: T.tx }} data-row={i} data-col={2} onKeyDown={workNav}><option value="meter">{t('meter')}</option><option value="piece">{t('piece')}</option></select></td>
                    <td style={td}><input type="number" min="0" step="0.01" value={p.one_rs || ''} onChange={e => updateWork(i, 'one_rs', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={3} onKeyDown={workNav} /></td>
                    <td style={td}><input type="number" min="0" step="0.01" value={p.stitch_rate || ''} onChange={e => updateWork(i, 'stitch_rate', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={4} onKeyDown={workNav} /></td>
                    <td style={calcCell}>{p.one_mp ? p.one_mp : '—'}</td>
                    <td style={td}><input type="number" min="0" step="0.01" value={p.meter_per_pcs || ''} onChange={e => updateWork(i, 'meter_per_pcs', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={6} onKeyDown={workNav} /></td>
                    <td style={td}><input type="number" min="0" step="0.01" value={p.rate || ''} onChange={e => updateWork(i, 'rate', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={7} onKeyDown={workNav} /></td>
                    <td style={{ ...calcCell, color: T.gr }}>{p.total ? '₹' + p.total.toFixed(0) : '—'}</td>
                    <td style={td}><input list="dl-fn" value={p.fabric_name} onChange={e => updateWork(i, 'fabric_name', e.target.value)} placeholder={t('fabricPlaceholder')} style={txtIn} data-row={i} data-col={9} onKeyDown={workNav} /></td>
                    <td style={td}><input type="number" min="0" step="0.01" value={p.fabric_meter || ''} onChange={e => updateWork(i, 'fabric_meter', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={10} onKeyDown={workNav} /></td>
                    <td style={td}>{workParts.length > 1 && <button onClick={() => setWorkParts(p => p.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 13 }}>×</button>}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(52,211,153,.10)', borderTop: `2px solid ${T.gr}` }}>
                  <td colSpan={10} style={{ padding: '7px 6px', fontSize: 11, fontWeight: 700, color: T.tx, textAlign: 'right' }}>{t('grandTotal')}</td>
                  <td style={{ padding: '7px 4px', fontFamily: T.sora, fontSize: 13, fontWeight: 700, color: T.gr, textAlign: 'right' }}>{workGT ? '₹' + workGT.toLocaleString('en-IN') : '—'}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <datalist id="dl-pn">{partNames.map(n => <option key={n} value={n} />)}</datalist>
            <datalist id="dl-fn">{fabricNames.map(n => <option key={n} value={n} />)}</datalist>
          </div>
          <button onClick={() => setWorkParts(p => [...p, { ...EMPTY_WORK_PART, sort_order: p.length }])} style={{ ...S.btnGhost, fontSize: 9, padding: '4px 10px', cursor: 'pointer', marginBottom: 4 }}>{t('addPart')}</button>

          <SectionTitle color={T.bl}>{t('fabricProgram')}</SectionTitle>
          <div className="prg-table-wrap" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 10, marginBottom: 6 }}>
            <table id="fabric-tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, width: '65%' }}>{t('partName')}</th><th style={th}>{t('fabricMeter')}</th><th style={{ ...th, width: 24 }}></th></tr></thead>
              <tbody>
                {fabricParts.map((p, i) => (
                  <tr key={i}>
                    <td style={td}><input list="dl-pn" value={p.part_name} onChange={e => updateFabric(i, 'part_name', e.target.value)} placeholder={t('partPlaceholder')} style={txtIn} data-row={i} data-col={0} onKeyDown={fabricNav} /></td>
                    <td style={td}><input type="number" min="0" step="0.01" value={p.fabric_meter || ''} onChange={e => updateFabric(i, 'fabric_meter', Math.max(0, Number(e.target.value)))} style={numIn} data-row={i} data-col={1} onKeyDown={fabricNav} /></td>
                    <td style={td}>{fabricParts.length > 1 && <button onClick={() => setFabricParts(p => p.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 13 }}>×</button>}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(56,189,248,.06)' }}>
                  <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10, color: T.tx3, textAlign: 'center' }}>{fabricParts.length} {fabricParts.length !== 1 ? t('partPlural') : t('partSingular')}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button onClick={() => setFabricParts(p => [...p, { ...EMPTY_FABRIC_PART, sort_order: p.length }])} style={{ ...S.btnGhost, fontSize: 9, padding: '4px 10px', cursor: 'pointer', marginBottom: 4 }}>{t('addPart')}</button>

          <SectionTitle color={T.yl}>{t('matchingProgram')}</SectionTitle>
          <MatchingCompanyRepeater rows={form.matchings} onChange={v => setField('matchings', v)} t={t} brandOptions={brandNames} />

          <div className="prg-grand-fabric" onClick={() => setShowFB(v => !v)} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 18, padding: '12px 16px', background: 'rgba(56,189,248,.06)', border: `1px solid rgba(56,189,248,.15)`, borderRadius: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandFabricTotal')}</span>
            <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: T.bl }}>{(workFM + fabricFM).toFixed(2)} m</span>
            <span style={{ fontSize: 10, color: T.tx3, transform: showFB ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .15s' }}>▶</span>
          </div>
          {showFB && <FabricBreakdown items={fbItems} t={t} />}
          {error && !isSkuError && <div style={{ ...S.errorBox, marginTop: 12 }}>{error === 'conflictError' ? t('conflictError') : error}</div>}
          <div className="prg-actions-row" style={{ display: 'flex', gap: 8, marginTop: 16, borderTop: `1px solid ${T.bd}`, paddingTop: 16 }}>
            <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', cursor: 'pointer', height: 40 }}>{t('cancel')}</button>
            <button onClick={handleSave} disabled={saving} style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1, height: 40 }}>{saving ? t('saving') : t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
