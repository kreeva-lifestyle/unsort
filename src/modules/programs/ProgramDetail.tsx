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
  const [showFabricBreakdown, setShowFabricBreakdown] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: m }, { parts }] = await Promise.all([
        fetchProgramById(programId), fetchMatchings(programId), fetchPriceWithParts(programId),
      ]);
      if (!p || p.is_deleted) { onClose(); return; }
      setProgram(p); setMatchings(m);
      setWorkParts(parts.filter(pt => (pt.section || 'work') === 'work'));
      setFabricParts(parts.filter(pt => pt.section === 'fabric'));
    } finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [programId]);

  const workTotal = program ? workParts.reduce((s, p) => s + Number(p.total || 0), 0) : 0;
  const workFM = workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricFM = fabricParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricBreakdownItems = useMemo(() => {
    const map: Record<string, number> = {};
    [...workParts, ...fabricParts].forEach(p => {
      const name = (p.fabric_name || '').trim(); const m = Number(p.fabric_meter || 0);
      if (name && m) map[name] = (map[name] || 0) + m;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [workParts, fabricParts]);

  if (loading || !program) return <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.tx3 }}><div className="spinner" /><span style={{ fontSize: 11 }}>{t('loading')}</span></div>;

  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;
  const typeLabel = (v: string) => v === 'piece' ? t('piece') : t('meter');
  const thS: React.CSSProperties = { ...S.thStyle, padding: '10px 14px' };
  const thR: React.CSSProperties = { ...thS, textAlign: 'right' };
  const tdS: React.CSSProperties = { ...S.tdStyle, padding: '10px 14px', fontFamily: T.mono };
  const tdR: React.CSSProperties = { ...tdS, textAlign: 'right' };

  return (
    <div className="prg-detail" style={{ fontFamily: T.sans, color: T.tx, padding: '24px 28px', maxWidth: 1180 }}>
      {/* Breadcrumb + header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${T.bd}` }}>
        <div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.tx3, fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            {t('title')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: T.sora, fontSize: 26, fontWeight: 700, color: T.tx, letterSpacing: -0.5 }}>{program.program_uid}</span>
            {program.voice_note_path && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 14, color: T.yl, fontSize: 10, fontWeight: 600 }}>
                <svg viewBox="0 0 24 24" style={{ width: 11, height: 11, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /></svg>
                Voice
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onEdit(program, matchings.map(m => ({ company_name: m.company_name, matching_label: m.matching_label || '' })))} style={S.btnPrimary}>{t('edit')}</button>
        </div>
      </div>

      {/* SKU + Image strip */}
      <div className="prg-detail-grid" style={{ display: 'grid', gridTemplateColumns: imageUrl ? '1fr 1fr 280px' : '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: 600, marginBottom: 4 }}>{t('sellingSkuLabel')}</div>
          <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700, color: T.ac2, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{program.selling_sku || '—'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontSize: 9, color: T.tx3, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: 600, marginBottom: 4 }}>{t('manufacturingSkuLabel')}</div>
          <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700, color: T.bl, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{program.manufacturing_sku || '—'}</div>
        </div>
        {imageUrl && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', background: T.s2 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.tx, fontWeight: 500 }}>Image attached</div>
              <a href={program.dropbox_gdrive_link || ''} target="_blank" rel="noopener" style={{ fontSize: 10, color: T.ac2, textDecoration: 'none' }}>{t('openOriginal')} ↗</a>
            </div>
          </div>
        )}
      </div>

      {/* Voice note */}
      <VoiceRecorder programId={programId} existingPath={program.voice_note_path} onUploaded={() => load()} t={t} />

      {/* Brands */}
      {matchings.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle color={T.yl}>{t('brands')} <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, padding: '2px 7px', border: `1px solid ${T.bd}`, borderRadius: 10, marginLeft: 6 }}>{matchings.length}</span></SectionTitle>
          <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={thS}>{t('brandName')}</th><th style={thS}>{t('brandLabel')}</th></tr></thead>
              <tbody>{matchings.map(m => (
                <tr key={m.id}><td style={{ ...S.tdStyle, padding: '10px 14px' }}>{m.company_name}</td><td style={{ ...S.tdStyle, padding: '10px 14px', color: T.tx3, fontFamily: T.mono }}>{m.matching_label || '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Work Program */}
      {workParts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle color={T.gr}>{t('workProgram')} <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, padding: '2px 7px', border: `1px solid ${T.bd}`, borderRadius: 10, marginLeft: 6 }}>{workParts.length}</span></SectionTitle>
          <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
              <thead><tr>
                <th style={thS}>{t('partName')}</th><th style={thR}>{t('stitch')}</th><th style={thS}>{t('stitchType')}</th><th style={thR}>{t('oneRs')}</th>
                <th style={thR}>{t('stitchRate')}</th><th style={thR}>{t('oneMP')}</th><th style={thR}>{t('meterPerPcs')}</th>
                <th style={thR}>{t('rate')}</th><th style={thR}>{t('total')}</th><th style={thS}>{t('fabricName')}</th><th style={thR}>{t('fm')}</th>
              </tr></thead>
              <tbody>{workParts.map(p => {
                const s = Number(p.stitch), rs = Number(p.one_rs), sr = Number(p.stitch_rate), mp = Number(p.one_mp), mpc = Number(p.meter_per_pcs), r = Number(p.rate), tot = Number(p.total), fm = Number(p.fabric_meter);
                return (
                <tr key={p.id}>
                  <td style={{ ...S.tdStyle, padding: '10px 14px' }}>{p.part_name || '—'}</td><td style={tdR}>{s || '—'}</td>
                  <td style={{ ...S.tdStyle, padding: '10px 14px', fontSize: 11, color: T.tx3 }}>{typeLabel(p.stitch_type)}</td>
                  <td style={tdR}>{rs ? rs.toFixed(2) : '—'}</td><td style={tdR}>{sr ? sr.toFixed(2) : '—'}</td>
                  <td style={{ ...tdR, color: T.ac2, fontWeight: 600 }}>{mp || '—'}</td>
                  <td style={tdR}>{mpc ? mpc.toFixed(2) : '—'}</td><td style={tdR}>{r ? r.toFixed(2) : '—'}</td>
                  <td style={{ ...tdR, fontFamily: T.sora, color: T.gr, fontWeight: 700 }}>{tot ? '₹' + tot.toFixed(0) : '—'}</td>
                  <td style={{ ...S.tdStyle, padding: '10px 14px', color: T.tx2, fontSize: 11 }}>{p.fabric_name || '—'}</td>
                  <td style={{ ...tdR, color: T.bl, fontWeight: 600 }}>{fm ? fm.toFixed(2) : '—'}</td>
                </tr>);
              })}</tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Fabric Program */}
      {fabricParts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionTitle color={T.bl}>{t('fabricProgram')} <span style={{ fontFamily: T.mono, fontSize: 10, color: T.tx3, padding: '2px 7px', border: `1px solid ${T.bd}`, borderRadius: 10, marginLeft: 6 }}>{fabricParts.length}</span></SectionTitle>
          <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...thS, width: '45%' }}>{t('partName')}</th><th style={thS}>{t('fabricName')}</th><th style={thR}>{t('fabricMeter')}</th></tr></thead>
              <tbody>
                {fabricParts.map(p => (
                  <tr key={p.id}><td style={{ ...S.tdStyle, padding: '10px 14px' }}>{p.part_name || '—'}</td><td style={{ ...S.tdStyle, padding: '10px 14px', color: T.tx2, fontSize: 11 }}>{p.fabric_name || '—'}</td><td style={{ ...S.tdStyle, padding: '10px 14px', fontFamily: T.mono, textAlign: 'right', color: T.bl, fontWeight: 600 }}>{Number(p.fabric_meter || 0).toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Totals */}
      {(workParts.length > 0 || fabricParts.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          <div className="prg-grand-fabric" onClick={() => setShowFabricBreakdown(v => !v)} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 10, cursor: 'pointer' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandFabricTotal')}</span>
            <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: T.bl, letterSpacing: -0.3 }}>{(workFM + fabricFM).toFixed(2)} m</span>
            <span style={{ fontSize: 10, color: T.tx3, transform: showFabricBreakdown ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .15s' }}>▶</span>
          </div>
          {showFabricBreakdown && <FabricBreakdown items={fabricBreakdownItems} t={t} />}
          {workTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'rgba(52,211,153,.06)', border: '1px solid rgba(52,211,153,.2)', borderRadius: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandWorkTotal')}</span>
              <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: T.gr, letterSpacing: -0.3 }}>₹{workTotal.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      {/* Logs */}
      <div style={{ borderTop: `1px solid ${T.bd}`, paddingTop: 14 }}>
        <SectionTitle color={T.tx3}>{t('history')}</SectionTitle>
        <ProgramHistory programId={programId} t={t} />
      </div>
    </div>
  );
}
