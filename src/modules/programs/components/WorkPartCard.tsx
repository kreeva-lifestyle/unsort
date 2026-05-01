import { T } from '../../../lib/theme';
import type { PricePartRow } from '../types';
import type { TranslationKey } from '../i18n/en';

interface Props {
  p: PricePartRow;
  i: number;
  canDelete: boolean;
  numIn: React.CSSProperties;
  txtIn: React.CSSProperties;
  selIn: React.CSSProperties;
  onUpdate: (i: number, field: keyof PricePartRow, value: string | number) => void;
  onDelete: (i: number) => void;
  t: (key: TranslationKey) => string;
}

const lbl: React.CSSProperties = { fontSize: 8, color: '#6B7890', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 };

export default function WorkPartCard({ p, i, canDelete, numIn, txtIn, selIn, onUpdate, onDelete, t }: Props) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <input list="dl-pn" value={p.part_name} onChange={e => onUpdate(i, 'part_name', e.target.value)} placeholder={t('partPlaceholder')} style={{ ...txtIn, flex: 1, fontWeight: 600, fontSize: 14 }} />
        {canDelete && <button onClick={() => onDelete(i)} style={{ border: 'none', background: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18, marginLeft: 8, minWidth: 32, minHeight: 32 }}>×</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div><div style={lbl}>{t('stitch')}</div><input type="number" min="0" value={p.stitch || ''} onChange={e => onUpdate(i, 'stitch', Math.max(0, Number(e.target.value)))} style={numIn} /></div>
        <div><div style={lbl}>{t('stitchType')}</div><select value={p.stitch_type || 'meter'} onChange={e => onUpdate(i, 'stitch_type', e.target.value)} style={{ ...selIn, color: T.tx }}><option value="meter">{t('meter')}</option><option value="piece">{t('piece')}</option></select></div>
        <div><div style={lbl}>{t('oneRs')}</div><input type="number" min="0" step="0.01" value={p.one_rs || ''} onChange={e => onUpdate(i, 'one_rs', Math.max(0, Number(e.target.value)))} style={numIn} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div><div style={lbl}>{t('stitchRate')}</div><input type="number" min="0" step="0.01" value={p.stitch_rate || ''} onChange={e => onUpdate(i, 'stitch_rate', Math.max(0, Number(e.target.value)))} style={numIn} /></div>
        <div><div style={lbl}>{t('oneMP')}</div><div style={{ ...numIn, background: 'rgba(255,255,255,0.02)', color: '#818CF8', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px' }}>{p.one_mp || '—'}</div></div>
        <div><div style={lbl}>{t('meterPerPcs')}</div><input type="number" min="0" step="0.01" value={p.meter_per_pcs || ''} onChange={e => onUpdate(i, 'meter_per_pcs', Math.max(0, Number(e.target.value)))} style={numIn} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div><div style={lbl}>{t('rate')}</div><input type="number" min="0" step="0.01" value={p.rate || ''} onChange={e => onUpdate(i, 'rate', Math.max(0, Number(e.target.value)))} style={numIn} /></div>
        <div><div style={lbl}>{t('total')}</div><div style={{ ...numIn, background: 'rgba(34,197,94,.06)', color: '#22C55E', fontWeight: 700, fontFamily: "'Sora',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px' }}>{p.total ? '₹' + p.total.toFixed(0) : '—'}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><div style={lbl}>{t('fabricName')}</div><input list="dl-fn" value={p.fabric_name} onChange={e => onUpdate(i, 'fabric_name', e.target.value)} placeholder={t('fabricPlaceholder')} style={txtIn} /></div>
        <div><div style={lbl}>{t('fabricMeter')}</div><input type="number" min="0" step="0.01" value={p.fabric_meter || ''} onChange={e => onUpdate(i, 'fabric_meter', Math.max(0, Number(e.target.value)))} style={numIn} /></div>
      </div>
    </div>
  );
}
