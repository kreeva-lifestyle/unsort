import { useState, useEffect, useCallback } from 'react';
import { T, S } from '../../lib/theme';
import { fetchPriceWithParts, upsertProgramPrice } from './lib/supabase-rpc';
import { useNotifications } from '../../hooks/useNotifications';
import type { PricePartRow } from './types';
import { EMPTY_PART } from './types';
import type { TranslationKey } from './i18n/en';

interface Props {
  programId: string;
  t: (key: TranslationKey) => string;
}

export default function ProgramPriceEditor({ programId, t }: Props) {
  const [parts, setParts] = useState<PricePartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { addToast } = useNotifications();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { parts: dbParts } = await fetchPriceWithParts(programId);
      setParts(dbParts.length > 0 ? dbParts.map(p => ({
        id: p.id, part_name: p.part_name || '', job_stitch: p.job_stitch || '',
        stitch_rate: Number(p.stitch_rate || 0), one_mp: Number(p.one_mp || 0),
        meter_per_pcs: Number(p.meter_per_pcs || 0), rate: Number(p.rate || 0),
        total: Number(p.total || 0), fabric_meter: Number(p.fabric_meter || 0),
        sort_order: p.sort_order,
      })) : [{ ...EMPTY_PART }]);
      setLoading(false);
    })();
  }, [programId]);

  const updatePart = useCallback((i: number, field: keyof PricePartRow, value: string | number) => {
    setParts(prev => {
      const next = [...prev];
      const row = { ...next[i], [field]: value };
      // Auto-calculate total: rate × meter_per_pcs (fabric cost per piece)
      if (field === 'rate' || field === 'meter_per_pcs') {
        row.total = Math.round(Number(row.rate) * Number(row.meter_per_pcs) * 100) / 100;
      }
      next[i] = row;
      return next;
    });
  }, []);

  const addPart = () => setParts(p => [...p, { ...EMPTY_PART, sort_order: p.length }]);
  const removePart = (i: number) => setParts(p => p.filter((_, j) => j !== i));

  const grandTotal = parts.reduce((s, p) => s + Number(p.total || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    const { result, error } = await upsertProgramPrice(programId, parts);
    setSaving(false);
    if (error || !result?.ok) { addToast(t('saveFailed'), 'error'); return; }
    addToast(t('pricesSaved'), 'success');
  };

  const th: React.CSSProperties = { ...S.thStyle, padding: '8px 10px', fontSize: 9 };
  const tdCell: React.CSSProperties = { padding: '6px 6px', borderBottom: `1px solid ${T.bd}` };
  const numInput: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`,
    borderRadius: 4, color: T.tx, fontFamily: T.mono, fontSize: 11, padding: '5px 6px',
    outline: 'none', textAlign: 'right' as const, boxSizing: 'border-box' as const,
  };
  const textInput: React.CSSProperties = { ...numInput, textAlign: 'left' as const };

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: T.tx3, fontSize: 11 }}>{t('loading')}</div>;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.sora }}>{t('priceBreakdown')}</span>
        <button onClick={addPart} style={{ ...S.btnGhost, fontSize: 10, padding: '4px 10px', cursor: 'pointer' }}>{t('addPart')}</button>
      </div>

      <div style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={th}>{t('partName')}</th>
              <th style={th}>{t('jobStitch')}</th>
              <th style={th}>{t('stitchRate')}</th>
              <th style={th}>{t('oneMP')}</th>
              <th style={th}>{t('meterPerPcs')}</th>
              <th style={th}>{t('rate')}</th>
              <th style={th}>{t('total')}</th>
              <th style={th}>{t('fabricMeter')}</th>
              <th style={{ ...th, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p, i) => (
              <tr key={i}>
                <td style={tdCell}><input value={p.part_name} onChange={e => updatePart(i, 'part_name', e.target.value)} style={textInput} /></td>
                <td style={tdCell}><input value={p.job_stitch} onChange={e => updatePart(i, 'job_stitch', e.target.value)} style={textInput} /></td>
                <td style={tdCell}><input type="number" value={p.stitch_rate || ''} onChange={e => updatePart(i, 'stitch_rate', Number(e.target.value))} style={numInput} /></td>
                <td style={tdCell}><input type="number" value={p.one_mp || ''} onChange={e => updatePart(i, 'one_mp', Number(e.target.value))} style={numInput} /></td>
                <td style={tdCell}><input type="number" value={p.meter_per_pcs || ''} onChange={e => updatePart(i, 'meter_per_pcs', Number(e.target.value))} style={numInput} /></td>
                <td style={tdCell}><input type="number" value={p.rate || ''} onChange={e => updatePart(i, 'rate', Number(e.target.value))} style={numInput} /></td>
                <td style={{ ...tdCell, fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.gr, padding: '5px 8px', textAlign: 'right' }}>
                  ₹{Number(p.total || 0).toFixed(2)}
                </td>
                <td style={tdCell}><input type="number" value={p.fabric_meter || ''} onChange={e => updatePart(i, 'fabric_meter', Number(e.target.value))} style={numInput} /></td>
                <td style={tdCell}>
                  {parts.length > 1 && (
                    <button onClick={() => removePart(i)} style={{ border: 'none', background: 'none', color: T.re, cursor: 'pointer', fontSize: 14, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, transition: T.transition }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,.1)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>×</button>
                  )}
                </td>
              </tr>
            ))}
            {/* Grand total row */}
            <tr style={{ background: 'rgba(99,102,241,.04)' }}>
              <td colSpan={6} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: T.tx, textAlign: 'right' }}>{t('grandTotal')}</td>
              <td style={{ padding: '8px 8px', fontFamily: T.sora, fontSize: 13, fontWeight: 700, color: T.gr, textAlign: 'right' }}>₹{grandTotal.toFixed(2)}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ ...S.btnPrimary, fontSize: 11, padding: '7px 16px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? t('saving') : t('savePrices')}
        </button>
      </div>
    </div>
  );
}
