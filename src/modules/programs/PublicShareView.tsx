import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import { toDirectImageUrl } from './lib/image-url-converters';
import { getVoiceNoteUrl } from './lib/supabase-rpc';

interface Props { shareToken: string }

export default function PublicShareView({ shareToken }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: result, error: rpcErr } = await supabase.rpc('get_shared_program', { p_share_token: shareToken });
      if (rpcErr || !result?.ok) { setError(result?.error || rpcErr?.message || 'Program not found or link expired.'); setLoading(false); return; }
      setData(result);
      setLoading(false);
    })();
  }, [shareToken]);

  if (loading) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.tx3 }}><div className="spinner" style={{ marginRight: 8 }} /> Loading...</div>;
  if (error || !data) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: T.tx3 }}><div style={{ fontSize: 28 }}>🔗</div><div style={{ fontSize: 13 }}>{error || 'Not found'}</div></div>;

  const program = data.program;
  const matchings = data.matchings || [];
  const parts = data.prices || [];
  const history = data.history || [];
  const workParts = parts.filter((p: any) => (p.section || 'work') === 'work');
  const fabricParts = parts.filter((p: any) => p.section === 'fabric');
  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;
  const voiceUrl = program.voice_note_path ? getVoiceNoteUrl(program.voice_note_path) : null;
  const workTotal = workParts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);
  const workFM = workParts.reduce((s: number, p: any) => s + Number(p.fabric_meter || 0), 0);
  const fabricFM = fabricParts.reduce((s: number, p: any) => s + Number(p.fabric_meter || 0), 0);
  const label: React.CSSProperties = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 };
  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', color: T.tx3, fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${T.bd}` };
  const tdS: React.CSSProperties = { padding: '6px 8px', fontSize: 11, borderBottom: `1px solid ${T.bd}`, color: T.tx2 };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.tx, fontFamily: T.sans }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '30px 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DailyOffice</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.sora, marginTop: 8 }}>{program.program_uid}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Shared program report</div>
        </div>

        {/* Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={label}>Selling SKU</div>
            <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ac2 }}>{program.selling_sku || '—'}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={label}>Manufacturing SKU</div>
            <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.bl }}>{program.manufacturing_sku || '—'}</div>
          </div>
        </div>

        {/* Image */}
        {imageUrl && <div style={{ marginBottom: 16 }}><img src={imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, border: `1px solid ${T.bd}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}

        {/* Brands */}
        {matchings.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, marginBottom: 6 }}>Brands ({matchings.length})</div>
            <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr><th style={th}>Brand Name</th><th style={th}>Label</th></tr></thead>
                <tbody>
                  {matchings.map((m: any, i: number) => (
                    <tr key={i}>
                      <td style={tdS}>{m.company_name}</td>
                      <td style={{ ...tdS, color: T.tx3 }}>{m.matching_label || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Voice */}
        {voiceUrl && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Voice Note</div>
            <audio controls src={voiceUrl} style={{ width: '100%', height: 36, marginTop: 4 }} />
          </div>
        )}

        {/* Work Program */}
        {workParts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, color: T.gr, fontSize: 9, marginBottom: 6 }}>Work Program</div>
            <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 600 }}>
                <thead><tr>
                  <th style={th}>Part</th><th style={th}>Stitch</th><th style={th}>1 RS</th>
                  <th style={th}>Rate</th><th style={th}>1 M/P</th><th style={th}>MTR/PCS</th>
                  <th style={th}>Total</th><th style={th}>Fabric</th><th style={th}>FM</th>
                </tr></thead>
                <tbody>
                  {workParts.map((p: any, i: number) => (
                    <tr key={i}>
                      <td style={tdS}>{p.part_name || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{Number(p.stitch || 0)}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{Number(p.one_rs || 0).toFixed(2)}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{Number(p.rate || 0).toFixed(2)}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right', color: T.ac2, fontWeight: 600 }}>{Number(p.one_mp || 0)}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{Number(p.meter_per_pcs || 0)}</td>
                      <td style={{ ...tdS, fontFamily: T.sora, textAlign: 'right', color: T.gr, fontWeight: 700 }}>₹{Number(p.total || 0).toFixed(0)}</td>
                      <td style={tdS}>{p.fabric_name || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right', color: T.bl }}>{Number(p.fabric_meter || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(52,211,153,.04)' }}>
                    <td colSpan={6} style={{ padding: '8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>Grand Total</td>
                    <td style={{ padding: '8px', fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.gr, textAlign: 'right' }}>₹{workTotal.toFixed(0)}</td>
                    <td style={{ padding: '8px', fontSize: 9, fontWeight: 600, color: T.tx3, textAlign: 'right' }}>FM</td>
                    <td style={{ padding: '8px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.bl, textAlign: 'right' }}>{workFM.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fabric Program */}
        {fabricParts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, color: T.bl, fontSize: 9, marginBottom: 6 }}>Fabric Program</div>
            <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr><th style={{ ...th, width: '65%' }}>Part</th><th style={th}>Fabric Meter</th></tr></thead>
                <tbody>
                  {fabricParts.map((p: any, i: number) => (
                    <tr key={i}>
                      <td style={tdS}>{p.part_name || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right', color: T.bl, fontWeight: 600 }}>{Number(p.fabric_meter || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(56,189,248,.04)' }}>
                    <td style={{ padding: '8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>Grand Total</td>
                    <td style={{ padding: '8px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.bl, textAlign: 'right' }}>{fabricFM.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grand Fabric Total */}
        {(workParts.length > 0 || fabricParts.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: 'rgba(56,189,248,.06)', border: `1px solid rgba(56,189,248,.15)`, borderRadius: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>Grand Fabric Total</span>
            <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: T.bl }}>{(workFM + fabricFM).toFixed(2)} m</span>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, marginBottom: 6 }}>Edit History ({history.length})</div>
            <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              {history.slice(0, 15).map((h: any, i: number) => (
                <div key={i} style={{ padding: '6px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 9, color: T.tx3 }}>
                  <span style={{ fontWeight: 600, color: T.tx2, textTransform: 'capitalize' }}>{(h.action || '').replace('_', ' ')}</span>
                  {h.field_changed && <span style={{ fontFamily: T.mono }}> · {h.field_changed}</span>}
                  {' — '}{h.user_email || 'System'} · {new Date(h.changed_at).toLocaleString('en-IN')}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 9, color: T.tx3, opacity: 0.4, marginTop: 20, paddingBottom: 20 }}>Powered by DailyOffice · Arya Designs</div>
      </div>
    </div>
  );
}
