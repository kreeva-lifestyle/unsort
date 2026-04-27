import { useState, useEffect, useMemo } from 'react';
import { T, S } from '../../lib/theme';
import { fetchProgramById, fetchMatchings, fetchPriceWithParts } from './lib/supabase-rpc';
import { toDirectImageUrl } from './lib/image-url-converters';
import SectionTitle from './components/SectionTitle';
import FabricBreakdown from './components/FabricBreakdown';
import ProgramHistory from './ProgramHistory';
import VoiceRecorder from './VoiceRecorder';
import type { Program, ProgramMatching, ProgramPricePart } from './types';
import type { TranslationKey } from './i18n/en';

interface Props {
  programId: string;
  onClose: () => void;
  onEdit: (p: Program, matchings: { company_name: string; matching_label: string }[]) => void;
  t: (key: TranslationKey) => string;
}

export default function ProgramDetail({ programId, onClose, onEdit, t }: Props) {
  const [program, setProgram] = useState<Program | null>(null);
  const [matchings, setMatchings] = useState<ProgramMatching[]>([]);
  const [workParts, setWorkParts] = useState<ProgramPricePart[]>([]);
  const [fabricParts, setFabricParts] = useState<ProgramPricePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showFabricBreakdown, setShowFabricBreakdown] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: m }, { parts }] = await Promise.all([
      fetchProgramById(programId), fetchMatchings(programId), fetchPriceWithParts(programId),
    ]);
    if (p?.is_deleted) { onClose(); return; }
    setProgram(p); setMatchings(m);
    setWorkParts(parts.filter(pt => (pt.section || 'work') === 'work'));
    setFabricParts(parts.filter(pt => pt.section === 'fabric'));
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [programId]);

  const workTotal = program ? workParts.reduce((s, p) => s + Number(p.total || 0), 0) : 0;
  const workFM = workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricFM = fabricParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricBreakdownItems = useMemo(() => {
    const map: Record<string, number> = {};
    [...workParts, ...fabricParts].forEach(p => {
      const name = (p.fabric_name || '').trim();
      const m = Number(p.fabric_meter || 0);
      if (name && m) map[name] = (map[name] || 0) + m;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [workParts, fabricParts]);

  if (loading || !program) return <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.tx3 }}><div className="spinner" /><span style={{ fontSize: 11 }}>{t('loading')}</span></div>;

  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;
  const label: React.CSSProperties = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 };
  const th: React.CSSProperties = { ...S.thStyle, padding: '6px 8px', fontSize: 9 };
  const thR: React.CSSProperties = { ...th, textAlign: 'right' };
  const td: React.CSSProperties = { ...S.tdStyle, padding: '6px 8px', fontSize: 11 };
  const tdR: React.CSSProperties = { ...td, fontFamily: T.mono, textAlign: 'right' };
  const typeLabel = (v: string) => v === 'piece' ? t('piece') : t('meter');

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', maxWidth: 860 }}>
      <div className="prg-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.bd}` }}>
        <span style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora }}>{program.program_uid}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onEdit(program, matchings.map(m => ({ company_name: m.company_name, matching_label: m.matching_label || '' })))}
            style={{ ...S.btnPrimary, fontSize: 10, padding: '6px 14px', cursor: 'pointer' }}>{t('edit')}</button>
          <button onClick={onClose} style={{ ...S.btnGhost, fontSize: 10, padding: '6px 14px', cursor: 'pointer' }}>{t('back')}</button>
        </div>
      </div>

      <div className="prg-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={label}>{t('sellingSkuLabel')}</div>
          <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.ac2 }}>{program.selling_sku || '—'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 14px' }}>
          <div style={label}>{t('manufacturingSkuLabel')}</div>
          <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: T.bl }}>{program.manufacturing_sku || '—'}</div>
        </div>
      </div>

      {imageUrl && (
        <div style={{ marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 12 }}>
          <img src={imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <a href={program.dropbox_gdrive_link || ''} target="_blank" rel="noopener" style={{ fontSize: 10, color: T.ac2, display: 'block', marginTop: 6 }}>{t('openOriginal')}</a>
        </div>
      )}

      <VoiceRecorder programId={programId} existingPath={program.voice_note_path} onUploaded={() => load()} t={t} />

      {matchings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionTitle color={T.yl}>{t('brands')}</SectionTitle>
          <div className="prg-table-wrap" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>{t('brandName')}</th><th style={th}>{t('brandLabel')}</th></tr></thead>
              <tbody>{matchings.map(m => (
                <tr key={m.id}><td style={td}>{m.company_name}</td><td style={{ ...td, color: T.tx3 }}>{m.matching_label || '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {workParts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionTitle color={T.gr}>{t('workProgram')}</SectionTitle>
          <div className="prg-table-wrap" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
              <thead><tr>
                <th style={th}>{t('partName')}</th><th style={thR}>{t('stitch')}</th><th style={th}>{t('stitchType')}</th><th style={thR}>{t('oneRs')}</th>
                <th style={thR}>{t('stitchRate')}</th><th style={thR}>{t('oneMP')}</th><th style={thR}>{t('meterPerPcs')}</th>
                <th style={thR}>{t('rate')}</th><th style={thR}>{t('total')}</th><th style={th}>{t('fabricName')}</th><th style={thR}>{t('fm')}</th>
              </tr></thead>
              <tbody>{workParts.map(p => {
                const s = Number(p.stitch), rs = Number(p.one_rs), sr = Number(p.stitch_rate), mp = Number(p.one_mp), mpc = Number(p.meter_per_pcs), r = Number(p.rate), tot = Number(p.total), fm = Number(p.fabric_meter);
                return (
                <tr key={p.id}>
                  <td style={td}>{p.part_name || '—'}</td><td style={tdR}>{s || '—'}</td>
                  <td style={{ ...td, fontSize: 10 }}>{typeLabel(p.stitch_type)}</td>
                  <td style={tdR}>{rs ? rs.toFixed(2) : '—'}</td><td style={tdR}>{sr ? sr.toFixed(2) : '—'}</td>
                  <td style={{ ...tdR, color: T.ac2, fontWeight: 600 }}>{mp || '—'}</td>
                  <td style={tdR}>{mpc ? mpc.toFixed(2) : '—'}</td><td style={tdR}>{r ? r.toFixed(2) : '—'}</td>
                  <td style={{ ...tdR, fontFamily: T.sora, color: T.gr, fontWeight: 700 }}>{tot ? '₹' + tot.toFixed(0) : '—'}</td>
                  <td style={td}>{p.fabric_name || '—'}</td><td style={{ ...tdR, color: T.bl }}>{fm ? fm.toFixed(2) : '—'}</td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {fabricParts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionTitle color={T.bl}>{t('fabricProgram')}</SectionTitle>
          <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, width: '65%' }}>{t('partName')}</th><th style={thR}>{t('fabricMeter')}</th></tr></thead>
              <tbody>
                {fabricParts.map(p => (
                  <tr key={p.id}><td style={td}>{p.part_name || '—'}</td><td style={{ ...td, fontFamily: T.mono, textAlign: 'right', color: T.bl, fontWeight: 600 }}>{Number(p.fabric_meter || 0).toFixed(2)}</td></tr>
                ))}
                <tr style={{ background: 'rgba(56,189,248,.04)' }}>
                  <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10, color: T.tx3, textAlign: 'center' }}>{fabricParts.length} {fabricParts.length !== 1 ? t('partPlural') : t('partSingular')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(workParts.length > 0 || fabricParts.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div className="prg-grand-fabric" onClick={() => setShowFabricBreakdown(v => !v)} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, padding: '10px 14px', background: 'rgba(56,189,248,.06)', border: `1px solid rgba(56,189,248,.15)`, borderRadius: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandFabricTotal')}</span>
            <span style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.bl }}>{(workFM + fabricFM).toFixed(2)} m</span>
            <span style={{ fontSize: 10, color: T.tx3, transform: showFabricBreakdown ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .15s' }}>▶</span>
          </div>
          {showFabricBreakdown && <FabricBreakdown items={fabricBreakdownItems} t={t} />}
          {workTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, padding: '10px 14px', background: 'rgba(52,211,153,.06)', border: `1px solid rgba(52,211,153,.15)`, borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandWorkTotal')}</span>
              <span style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.gr }}>₹{workTotal.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 12 }}>
        <button onClick={() => setShowHistory(!showHistory)} style={{ ...S.btnGhost, fontSize: 10, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>
          {t('history')}
        </button>
        {showHistory && <ProgramHistory programId={programId} t={t} />}
      </div>
    </div>
  );
}
