import { useState, useEffect, useCallback, useMemo } from 'react';
import { T, S } from '../../lib/theme';
import { fetchPriceWithParts, upsertProgramPrice, fetchLookup, addLookup } from './lib/supabase-rpc';
import { useNotifications } from '../../hooks/useNotifications';
import SectionTitle from './components/SectionTitle';
import FabricBreakdown from './components/FabricBreakdown';
import type { PricePartRow } from './types';
import { EMPTY_WORK_PART, EMPTY_FABRIC_PART } from './types';
import type { TranslationKey } from './i18n/en';

interface Props { programId: string; t: (key: TranslationKey) => string }

export default function ProgramPriceEditor({ programId, t }: Props) {
  const [workParts, setWorkParts] = useState<PricePartRow[]>([]);
  const [fabricParts, setFabricParts] = useState<PricePartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partNames, setPartNames] = useState<string[]>([]);
  const [fabricNames, setFabricNames] = useState<string[]>([]);
  const [showFabricBreakdown, setShowFabricBreakdown] = useState(false);
  const { addToast } = useNotifications();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ parts: dbParts }, pn, fn] = await Promise.all([
        fetchPriceWithParts(programId), fetchLookup('program_lookup_part_names'), fetchLookup('program_lookup_fabric_names'),
      ]);
      setPartNames(pn); setFabricNames(fn);
      const work = dbParts.filter(p => (p.section || 'work') === 'work').map(mapDbToRow);
      const fabric = dbParts.filter(p => p.section === 'fabric').map(mapDbToRow);
      setWorkParts(work.length > 0 ? work : [{ ...EMPTY_WORK_PART }]);
      setFabricParts(fabric.length > 0 ? fabric : [{ ...EMPTY_FABRIC_PART }]);
      setLoading(false);
    })();
  }, [programId]);

  const mapDbToRow = (p: any): PricePartRow => ({
    id: p.id, part_name: p.part_name || '', stitch: Number(p.stitch || 0),
    stitch_type: p.stitch_type || '',
    one_rs: Number(p.one_rs || 0), stitch_rate: Number(p.stitch_rate || 0),
    one_mp: Number(p.one_mp || 0), meter_per_pcs: Number(p.meter_per_pcs || 0),
    rate: Number(p.rate || 0), total: Number(p.total || 0),
    fabric_name: p.fabric_name || '', fabric_meter: Number(p.fabric_meter || 0),
    section: p.section || 'work', sort_order: p.sort_order,
  });

  const updateWork = useCallback((i: number, field: keyof PricePartRow, value: string | number) => {
    setWorkParts(prev => {
      const next = [...prev];
      const row = { ...next[i], [field]: value };
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

  const workGrandTotal = workParts.reduce((s, p) => s + Number(p.total || 0), 0);
  const workFM = workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricMeterTotal = fabricParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricBreakdownItems = useMemo(() => {
    const map: Record<string, number> = {};
    [...workParts, ...fabricParts].forEach(p => {
      const name = (p.fabric_name || '').trim(); const m = Number(p.fabric_meter || 0);
      if (name && m) map[name] = (map[name] || 0) + m;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [workParts, fabricParts]);

  const handleSave = async () => {
    setSaving(true);
    for (const p of [...workParts, ...fabricParts]) {
      if (p.part_name && !partNames.includes(p.part_name)) await addLookup('program_lookup_part_names', p.part_name);
      if (p.fabric_name && !fabricNames.includes(p.fabric_name)) await addLookup('program_lookup_fabric_names', p.fabric_name);
    }
    const allParts = [...workParts.map((p, i) => ({ ...p, section: 'work' as const, sort_order: i })),
                      ...fabricParts.map((p, i) => ({ ...p, section: 'fabric' as const, sort_order: i + 1000 }))];
    const { result, error } = await upsertProgramPrice(programId, allParts);
    setSaving(false);
    if (error || !result?.ok) { addToast(t('saveFailed'), 'error'); return; }
    addToast(t('pricesSaved'), 'success');
    const [pn, fn] = await Promise.all([fetchLookup('program_lookup_part_names'), fetchLookup('program_lookup_fabric_names')]);
    setPartNames(pn); setFabricNames(fn);
  };

  const th: React.CSSProperties = { ...S.thStyle, padding: '8px 8px', fontSize: 9 };
  const td: React.CSSProperties = { padding: '4px 4px', borderBottom: `1px solid ${T.bd}` };
  const numIn: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.mono, fontSize: 11, padding: '6px 6px', outline: 'none', textAlign: 'right' as const, boxSizing: 'border-box' as const };
  const txtIn: React.CSSProperties = { ...numIn, textAlign: 'left' as const };
  const selIn: React.CSSProperties = { ...numIn, textAlign: 'left' as const, appearance: 'none' as const, WebkitAppearance: 'none' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%236B7890'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', paddingRight: 18, cursor: 'pointer' };
  const calcCell: React.CSSProperties = { ...td, fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.ac2, padding: '6px 6px', textAlign: 'right' as const, background: 'rgba(255,255,255,0.02)' };
  const delBtn = (onClick: () => void) => (
    <button onClick={onClick} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 14, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, transition: T.transition }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,.1)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>×</button>
  );

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>{t('loading')}</div>;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SectionTitle color={T.gr}>{t('workProgram')}</SectionTitle>
        <button onClick={() => setWorkParts(p => [...p, { ...EMPTY_WORK_PART, sort_order: p.length }])} style={{ ...S.btnGhost, fontSize: 9, padding: '3px 8px', cursor: 'pointer' }}>{t('addPart')}</button>
      </div>
      <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
          <thead><tr>
            <th style={th}>{t('partName')}</th><th style={th}>{t('stitch')}</th><th style={th}>{t('stitchType')}</th><th style={th}>{t('oneRs')}</th>
            <th style={th}>{t('stitchRate')}</th><th style={th}>{t('oneMP')}</th><th style={th}>{t('meterPerPcs')}</th>
            <th style={th}>{t('rate')}</th><th style={th}>{t('total')}</th><th style={th}>{t('fabricName')}</th>
            <th style={th}>{t('fabricMeter')}</th><th style={{ ...th, width: 28 }}></th>
          </tr></thead>
          <tbody>
            {workParts.map((p, i) => (
              <tr key={i}>
                <td style={td}><input list="dl-Part" value={p.part_name} onChange={e => updateWork(i, 'part_name', e.target.value)} placeholder={t('partPlaceholder')} style={txtIn} /></td>
                <td style={td}><input type="number" min="0" value={p.stitch || ''} onChange={e => updateWork(i, 'stitch', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={td}><select value={p.stitch_type || 'meter'} onChange={e => updateWork(i, 'stitch_type', e.target.value)} style={{ ...selIn, color: T.tx }}><option value="meter">{t('meter')}</option><option value="piece">{t('piece')}</option></select></td>
                <td style={td}><input type="number" min="0" step="0.01" value={p.one_rs || ''} onChange={e => updateWork(i, 'one_rs', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={td}><input type="number" min="0" step="0.01" value={p.stitch_rate || ''} onChange={e => updateWork(i, 'stitch_rate', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={calcCell}>{p.one_mp || 0}</td>
                <td style={td}><input type="number" min="0" step="0.01" value={p.meter_per_pcs || ''} onChange={e => updateWork(i, 'meter_per_pcs', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={td}><input type="number" min="0" step="0.01" value={p.rate || ''} onChange={e => updateWork(i, 'rate', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={{ ...calcCell, color: T.gr }}>₹{Number(p.total || 0).toFixed(2)}</td>
                <td style={td}><input list="dl-Fabric" value={p.fabric_name} onChange={e => updateWork(i, 'fabric_name', e.target.value)} placeholder={t('fabricPlaceholder')} style={txtIn} /></td>
                <td style={td}><input type="number" min="0" step="0.01" value={p.fabric_meter || ''} onChange={e => updateWork(i, 'fabric_meter', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={td}>{workParts.length > 1 && delBtn(() => setWorkParts(p => p.filter((_, j) => j !== i)))}</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(99,102,241,.04)' }}>
              <td colSpan={8} style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, color: T.tx, textAlign: 'right' }}>{t('grandTotal')}</td>
              <td style={{ padding: '8px 6px', fontFamily: T.sora, fontSize: 13, fontWeight: 700, color: T.gr, textAlign: 'right' }}>₹{workGrandTotal.toFixed(2)}</td>
              <td style={{ padding: '8px 6px', fontSize: 10, fontWeight: 600, color: T.tx3, textAlign: 'right' }}>{t('totalFM')}</td>
              <td style={{ padding: '8px 6px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.bl, textAlign: 'right' }}>{workFM.toFixed(2)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <datalist id="dl-Part">{partNames.map(n => <option key={n} value={n} />)}</datalist>
        <datalist id="dl-Fabric">{fabricNames.map(n => <option key={n} value={n} />)}</datalist>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <SectionTitle color={T.bl}>{t('fabricProgram')}</SectionTitle>
        <button onClick={() => setFabricParts(p => [...p, { ...EMPTY_FABRIC_PART, sort_order: p.length }])} style={{ ...S.btnGhost, fontSize: 9, padding: '3px 8px', cursor: 'pointer' }}>{t('addPart')}</button>
      </div>
      <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, width: '60%' }}>{t('partName')}</th><th style={th}>{t('fabricMeter')}</th><th style={{ ...th, width: 28 }}></th></tr></thead>
          <tbody>
            {fabricParts.map((p, i) => (
              <tr key={i}>
                <td style={td}><input list="dl-Part" value={p.part_name} onChange={e => updateFabric(i, 'part_name', e.target.value)} placeholder={t('partPlaceholder')} style={txtIn} /></td>
                <td style={td}><input type="number" min="0" step="0.01" value={p.fabric_meter || ''} onChange={e => updateFabric(i, 'fabric_meter', Math.max(0, Number(e.target.value)))} style={numIn} /></td>
                <td style={td}>{fabricParts.length > 1 && delBtn(() => setFabricParts(p => p.filter((_, j) => j !== i)))}</td>
              </tr>
            ))}
            <tr style={{ background: 'rgba(56,189,248,.04)' }}>
              <td style={{ padding: '8px 8px', fontSize: 11, fontWeight: 700, color: T.tx, textAlign: 'right' }}>{t('grandTotal')}</td>
              <td style={{ padding: '8px 6px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.bl, textAlign: 'right' }}>{fabricMeterTotal.toFixed(2)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="prg-grand-fabric" onClick={() => setShowFabricBreakdown(v => !v)} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 14, padding: '10px 14px', background: 'rgba(56,189,248,.06)', border: `1px solid rgba(56,189,248,.15)`, borderRadius: 8, cursor: 'pointer' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandFabricTotal')}</span>
        <span style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.bl }}>{(workFM + fabricMeterTotal).toFixed(2)} m</span>
        <span style={{ fontSize: 10, color: T.tx3, transform: showFabricBreakdown ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .15s' }}>▶</span>
      </div>
      {showFabricBreakdown && <FabricBreakdown items={fabricBreakdownItems} t={t} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ ...S.btnPrimary, fontSize: 11, padding: '7px 16px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? t('saving') : t('savePrices')}
        </button>
      </div>
    </div>
  );
}
