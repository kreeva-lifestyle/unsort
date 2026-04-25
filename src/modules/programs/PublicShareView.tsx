import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import type { Program, ProgramMatching, ProgramPricePart, ProgramHistoryEntry } from './types';
import { toDirectImageUrl } from './lib/image-url-converters';
import { getVoiceNoteUrl } from './lib/supabase-rpc';

interface Props { shareToken: string }

export default function PublicShareView({ shareToken }: Props) {
  const [program, setProgram] = useState<Program | null>(null);
  const [matchings, setMatchings] = useState<ProgramMatching[]>([]);
  const [parts, setParts] = useState<ProgramPricePart[]>([]);
  const [history, setHistory] = useState<ProgramHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fetch program by share token (anon access via RLS)
      const { data: p, error: pErr } = await supabase.from('programs')
        .select('id, program_uid, selling_sku, manufacturing_sku, matching, dropbox_gdrive_link, voice_note_path, share_token, created_by, created_at, updated_at, is_deleted')
        .eq('share_token', shareToken).maybeSingle();
      if (pErr || !p) { setError('Program not found or link expired.'); setLoading(false); return; }
      setProgram(p as Program);

      const [{ data: m }, { data: pr }, { data: h }] = await Promise.all([
        supabase.from('program_matchings').select('id, program_id, company_name, matching_label, created_at').eq('program_id', p.id),
        supabase.from('program_price_parts').select('id, program_price_id, part_name, job_stitch, stitch_rate, one_mp, meter_per_pcs, rate, total, fabric_meter, sort_order, created_at')
          .in('program_price_id', await supabase.from('program_prices').select('id').eq('program_id', p.id).then(r => (r.data || []).map((x: any) => x.id))),
        supabase.from('program_history').select('id, program_id, user_id, user_email, action, field_changed, old_value, new_value, changed_at')
          .eq('program_id', p.id).order('changed_at', { ascending: false }),
      ]);
      setMatchings((m as ProgramMatching[] | null) || []);
      setParts((pr as ProgramPricePart[] | null) || []);
      setHistory((h as ProgramHistoryEntry[] | null) || []);
      setLoading(false);
    })();
  }, [shareToken]);

  if (loading) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.tx3 }}>Loading...</div>;
  if (error || !program) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: T.tx3 }}><div style={{ fontSize: 28 }}>🔗</div><div style={{ fontSize: 13 }}>{error || 'Not found'}</div></div>;

  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;
  const voiceUrl = program.voice_note_path ? getVoiceNoteUrl(program.voice_note_path) : null;
  const grandTotal = parts.reduce((s, p) => s + Number(p.total || 0), 0);
  const label: React.CSSProperties = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.tx, fontFamily: T.sans }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '30px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DailyOffice</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sora, marginTop: 8 }}>{program.program_uid}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>Shared program report</div>
        </div>

        {/* Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 10, padding: 14 }}>
          <div><div style={label}>Selling SKU</div><div style={{ fontFamily: T.mono, fontSize: 12 }}>{program.selling_sku || '—'}</div></div>
          <div><div style={label}>Manufacturing SKU</div><div style={{ fontFamily: T.mono, fontSize: 12 }}>{program.manufacturing_sku || '—'}</div></div>
          <div><div style={label}>Matching</div><div style={{ fontSize: 12 }}>{program.matching || '—'}</div></div>
        </div>

        {/* Image */}
        {imageUrl && <div style={{ marginBottom: 16 }}><img src={imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, border: `1px solid ${T.bd}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}

        {/* Companies */}
        {matchings.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Companies ({matchings.length})</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {matchings.map(m => (
                <span key={m.id} style={{ padding: '4px 10px', borderRadius: 6, background: T.ac3, color: T.ac2, fontSize: 11, fontWeight: 500, border: `1px solid rgba(99,102,241,.25)` }}>
                  {m.company_name}{m.matching_label ? ` · ${m.matching_label}` : ''}
                </span>
              ))}
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

        {/* Price */}
        {parts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Price Breakdown</div>
            <div style={{ overflowX: 'auto', marginTop: 6, border: `1px solid ${T.bd}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr style={{ borderBottom: `1px solid ${T.bd}` }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: T.tx3, fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Part</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', color: T.tx3, fontSize: 8 }}>Stitch Rate</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', color: T.tx3, fontSize: 8 }}>Rate</th>
                  <th style={{ padding: '6px 6px', textAlign: 'right', color: T.tx3, fontSize: 8 }}>Meter/PCS</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: T.tx3, fontSize: 8 }}>Total</th>
                </tr></thead>
                <tbody>
                  {parts.map(pt => (
                    <tr key={pt.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                      <td style={{ padding: '6px 8px', color: T.tx }}>{pt.part_name || '—'}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: T.mono }}>{Number(pt.stitch_rate || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: T.mono }}>{Number(pt.rate || 0).toFixed(2)}</td>
                      <td style={{ padding: '6px 6px', textAlign: 'right', fontFamily: T.mono }}>{Number(pt.meter_per_pcs || 0).toFixed(4)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: T.sora, fontWeight: 600, color: T.gr }}>₹{Number(pt.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(99,102,241,.04)' }}>
                    <td colSpan={4} style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>Grand Total</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', fontFamily: T.sora, fontSize: 13, fontWeight: 700, color: T.gr }}>₹{grandTotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={label}>Edit History ({history.length})</div>
            <div style={{ marginTop: 6, border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              {history.slice(0, 15).map(h => (
                <div key={h.id} style={{ padding: '6px 10px', borderBottom: `1px solid ${T.bd}`, fontSize: 9, color: T.tx3 }}>
                  <span style={{ fontWeight: 600, color: T.tx2, textTransform: 'capitalize' }}>{h.action.replace('_', ' ')}</span>
                  {h.field_changed && <span style={{ fontFamily: T.mono }}> · {h.field_changed}</span>}
                  {' — '}{h.user_email || 'System'} · {new Date(h.changed_at).toLocaleString('en-IN')}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', fontSize: 9, color: T.tx3, opacity: 0.4, marginTop: 20 }}>Powered by DailyOffice · Arya Designs</div>
      </div>
    </div>
  );
}
