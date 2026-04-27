import { useState, useEffect } from 'react';
import { T, S } from '../../lib/theme';
import { fetchProgramById, fetchMatchings, fetchPriceWithParts } from './lib/supabase-rpc';
import { toDirectImageUrl } from './lib/image-url-converters';
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

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: m }, { parts }] = await Promise.all([
      fetchProgramById(programId),
      fetchMatchings(programId),
      fetchPriceWithParts(programId),
    ]);
    if (p?.is_deleted) { onClose(); return; }
    setProgram(p);
    setMatchings(m);
    setWorkParts(parts.filter(pt => (pt.section || 'work') === 'work'));
    setFabricParts(parts.filter(pt => pt.section === 'fabric'));
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [programId]);

  if (loading || !program) return <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: T.tx3 }}><div className="spinner" /><span style={{ fontSize: 11 }}>{t('loading')}</span></div>;

  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;
  const workTotal = workParts.reduce((s, p) => s + Number(p.total || 0), 0);
  const workFM = workParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const fabricFM = fabricParts.reduce((s, p) => s + Number(p.fabric_meter || 0), 0);
  const label: React.CSSProperties = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 };
  const th: React.CSSProperties = { ...S.thStyle, padding: '6px 8px', fontSize: 9 };
  const thR: React.CSSProperties = { ...th, textAlign: 'right' };
  const td: React.CSSProperties = { ...S.tdStyle, padding: '6px 8px', fontSize: 11 };
  const tdR: React.CSSProperties = { ...td, fontFamily: T.mono, textAlign: 'right' };

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', maxWidth: 860 }}>
      {/* Header */}
      <div className="prg-detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 700, fontFamily: T.sora }}>{program.program_uid}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onEdit(program, matchings.map(m => ({ company_name: m.company_name, matching_label: m.matching_label || '' })))}
            style={{ ...S.btnPrimary, fontSize: 10, padding: '6px 14px', cursor: 'pointer' }}>{t('edit')}</button>
          <button onClick={onClose} style={{ ...S.btnGhost, fontSize: 10, padding: '6px 14px', cursor: 'pointer' }}>Back</button>
        </div>
      </div>

      {/* Info cards */}
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

      {/* Image */}
      {imageUrl && (
        <div style={{ marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 12 }}>
          <img src={imageUrl} alt="Program" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <a href={program.dropbox_gdrive_link || ''} target="_blank" rel="noopener" style={{ fontSize: 10, color: T.ac2, display: 'block', marginTop: 6 }}>Open original</a>
        </div>
      )}

      {/* Voice note */}
      <VoiceRecorder programId={programId} existingPath={program.voice_note_path} onUploaded={() => load()} t={t} />

      {/* ═══ BRANDS (read-only) ═══ */}
      {matchings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 4, height: 18, borderRadius: 2, background: T.yl }} />
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.sora, textTransform: 'uppercase', letterSpacing: 1.5, color: T.yl }}>Brands</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.bd} 0%, transparent 100%)` }} />
          </div>
          <div className="prg-table-wrap" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Brand Name</th><th style={th}>Label</th></tr></thead>
              <tbody>
                {matchings.map(m => (
                  <tr key={m.id}>
                    <td style={td}>{m.company_name}</td>
                    <td style={{ ...td, color: T.tx3 }}>{m.matching_label || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ WORK PROGRAM (read-only) ═══ */}
      {workParts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 4, height: 18, borderRadius: 2, background: T.gr }} />
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.sora, textTransform: 'uppercase', letterSpacing: 1.5, color: T.gr }}>Work Program</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.bd} 0%, transparent 100%)` }} />
          </div>
          <div className="prg-table-wrap" style={{ overflowX: 'auto', background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead><tr>
                <th style={th}>Part</th><th style={thR}>Stitch</th><th style={thR}>1 RS</th>
                <th style={thR}>Stitch Rate</th><th style={thR}>1 M/P</th><th style={thR}>MTR/PCS</th>
                <th style={thR}>Rate</th><th style={thR}>Total</th><th style={th}>Fabric</th><th style={thR}>FM</th>
              </tr></thead>
              <tbody>
                {workParts.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{p.part_name || '—'}</td>
                    <td style={tdR}>{Number(p.stitch || 0)}</td>
                    <td style={tdR}>{Number(p.one_rs || 0).toFixed(2)}</td>
                    <td style={tdR}>{Number(p.stitch_rate || 0).toFixed(2)}</td>
                    <td style={{ ...tdR, color: T.ac2, fontWeight: 600 }}>{Number(p.one_mp || 0)}</td>
                    <td style={tdR}>{Number(p.meter_per_pcs || 0).toFixed(2)}</td>
                    <td style={tdR}>{Number(p.rate || 0).toFixed(2)}</td>
                    <td style={{ ...tdR, fontFamily: T.sora, color: T.gr, fontWeight: 700 }}>₹{Number(p.total || 0).toFixed(0)}</td>
                    <td style={td}>{p.fabric_name || '—'}</td>
                    <td style={{ ...tdR, color: T.bl }}>{Number(p.fabric_meter || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ FABRIC PROGRAM (read-only) ═══ */}
      {fabricParts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 4, height: 18, borderRadius: 2, background: T.bl }} />
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: T.sora, textTransform: 'uppercase', letterSpacing: 1.5, color: T.bl }}>Fabric Program</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${T.bd} 0%, transparent 100%)` }} />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ ...th, width: '65%' }}>Part</th><th style={thR}>Fabric Meter</th></tr></thead>
              <tbody>
                {fabricParts.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{p.part_name || '—'}</td>
                    <td style={{ ...td, fontFamily: T.mono, textAlign: 'right', color: T.bl, fontWeight: 600 }}>{Number(p.fabric_meter || 0).toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(56,189,248,.04)' }}>
                  <td colSpan={2} style={{ padding: '6px 8px', fontSize: 10, color: T.tx3, textAlign: 'center' }}>{fabricParts.length} part{fabricParts.length !== 1 ? 's' : ''}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary totals */}
      {(workParts.length > 0 || fabricParts.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div className="prg-grand-fabric" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, padding: '10px 14px', background: 'rgba(56,189,248,.06)', border: `1px solid rgba(56,189,248,.15)`, borderRadius: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>Grand Fabric Total</span>
            <span style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.bl }}>{(workFM + fabricFM).toFixed(2)} m</span>
          </div>
          {workTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, padding: '10px 14px', background: 'rgba(52,211,153,.06)', border: `1px solid rgba(52,211,153,.15)`, borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>Grand Work Total</span>
              <span style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, color: T.gr }}>₹{workTotal.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      {/* History toggle */}
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
