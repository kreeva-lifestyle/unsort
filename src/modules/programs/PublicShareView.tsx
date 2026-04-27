import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { T } from '../../lib/theme';
import { toDirectImageUrl } from './lib/image-url-converters';
import { getVoiceNoteUrl } from './lib/supabase-rpc';
import { en } from './i18n/en';
import { gu } from './i18n/gu';
import FabricBreakdown from './components/FabricBreakdown';
import type { TranslationKey } from './i18n/en';

interface Props { shareToken: string }

export default function PublicShareView({ shareToken }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFB, setShowFB] = useState(false);

  const langParam = new URLSearchParams(window.location.hash.split('?')[1] || '').get('lang');
  const translations = langParam === 'gu' ? gu : en;
  const t = (key: TranslationKey): string => translations[key] ?? en[key] ?? key;
  const typeLabel = (v: string) => v === 'piece' ? t('piece') : t('meter');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: result, error: rpcErr } = await supabase.rpc('get_shared_program', { p_share_token: shareToken });
      if (rpcErr || !result?.ok) { setError(result?.error || rpcErr?.message || t('notFoundOrExpired')); setLoading(false); return; }
      setData(result); setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareToken]);

  const parts = data?.prices || [];
  const workParts = parts.filter((p: any) => (p.section || 'work') === 'work');
  const fabricParts = parts.filter((p: any) => p.section === 'fabric');
  const fbItems = useMemo(() => {
    const map: Record<string, number> = {};
    [...workParts, ...fabricParts].forEach((p: any) => {
      const name = (p.fabric_name || '').trim(); const m = Number(p.fabric_meter || 0);
      if (name && m) map[name] = (map[name] || 0) + m;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.tx3 }}><div className="spinner" style={{ marginRight: 8 }} /> {t('loading')}</div>;
  if (error || !data) return <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: T.tx3 }}><div style={{ fontSize: 28 }}>🔗</div><div style={{ fontSize: 13 }}>{error || t('notFound')}</div></div>;

  const program = data.program;
  const matchings = data.matchings || [];
  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;
  const voiceUrl = program.voice_note_path ? getVoiceNoteUrl(program.voice_note_path) : null;
  const workFM = workParts.reduce((s: number, p: any) => s + Number(p.fabric_meter || 0), 0);
  const fabricFM = fabricParts.reduce((s: number, p: any) => s + Number(p.fabric_meter || 0), 0);
  const workTotal = workParts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);
  const label: React.CSSProperties = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 };
  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', color: T.tx3, fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${T.bd}` };
  const tdS: React.CSSProperties = { padding: '6px 8px', fontSize: 11, borderBottom: `1px solid ${T.bd}`, color: T.tx2 };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.tx, fontFamily: T.sans }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '30px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: T.sora, fontSize: 16, fontWeight: 700, background: `linear-gradient(135deg, ${T.ac}, ${T.ac2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>DailyOffice</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.sora, marginTop: 8 }}>{program.program_uid}</div>
          <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{t('sharedReport')}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={label}>{t('sellingSkuLabel')}</div>
            <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.ac2 }}>{program.selling_sku || '—'}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={label}>{t('manufacturingSkuLabel')}</div>
            <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.bl }}>{program.manufacturing_sku || '—'}</div>
          </div>
        </div>
        {imageUrl && <div style={{ marginBottom: 16 }}><img src={imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, border: `1px solid ${T.bd}` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>}
        {matchings.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, marginBottom: 6 }}>{t('brands')} ({matchings.length})</div>
            <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr><th style={th}>{t('brandName')}</th><th style={th}>{t('brandLabel')}</th></tr></thead>
                <tbody>{matchings.map((m: any, i: number) => (
                  <tr key={i}><td style={tdS}>{m.company_name}</td><td style={{ ...tdS, color: T.tx3 }}>{m.matching_label || '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {voiceUrl && <div style={{ marginBottom: 16 }}><div style={label}>{t('voiceNote')}</div><audio controls src={voiceUrl} style={{ width: '100%', height: 36, marginTop: 4 }} /></div>}
        {workParts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, color: T.gr, fontSize: 9, marginBottom: 6 }}>{t('workProgram')}</div>
            <div style={{ overflowX: 'auto', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 650 }}>
                <thead><tr>
                  <th style={th}>{t('partName')}</th><th style={th}>{t('stitch')}</th><th style={th}>{t('stitchType')}</th><th style={th}>{t('oneRs')}</th>
                  <th style={th}>{t('rate')}</th><th style={th}>{t('oneMP')}</th><th style={th}>{t('meterPerPcs')}</th>
                  <th style={th}>{t('total')}</th><th style={th}>{t('fabricName')}</th><th style={th}>{t('fm')}</th>
                </tr></thead>
                <tbody>
                  {workParts.map((p: any, i: number) => {
                    const s = Number(p.stitch), rs = Number(p.one_rs), r = Number(p.rate), mp = Number(p.one_mp), mpc = Number(p.meter_per_pcs), tot = Number(p.total), fmv = Number(p.fabric_meter);
                    return (
                    <tr key={i}>
                      <td style={tdS}>{p.part_name || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{s || '—'}</td>
                      <td style={{ ...tdS, fontSize: 9 }}>{typeLabel(p.stitch_type || '')}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{rs ? rs.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{r ? r.toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right', color: T.ac2, fontWeight: 600 }}>{mp || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right' }}>{mpc || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.sora, textAlign: 'right', color: T.gr, fontWeight: 700 }}>{tot ? '₹' + tot.toFixed(0) : '—'}</td>
                      <td style={tdS}>{p.fabric_name || '—'}</td>
                      <td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right', color: T.bl }}>{fmv ? fmv.toFixed(2) : '—'}</td>
                    </tr>);
                  })}
                  <tr style={{ background: 'rgba(52,211,153,.04)' }}>
                    <td colSpan={7} style={{ padding: '8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{t('grandTotal')}</td>
                    <td style={{ padding: '8px', fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.gr, textAlign: 'right' }}>₹{workTotal.toFixed(0)}</td>
                    <td style={{ padding: '8px', fontSize: 9, fontWeight: 600, color: T.tx3, textAlign: 'right' }}>{t('fm')}</td>
                    <td style={{ padding: '8px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.bl, textAlign: 'right' }}>{workFM.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {fabricParts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...label, color: T.bl, fontSize: 9, marginBottom: 6 }}>{t('fabricProgram')}</div>
            <div style={{ border: `1px solid ${T.bd}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <thead><tr><th style={{ ...th, width: '65%' }}>{t('partName')}</th><th style={th}>{t('fabricMeter')}</th></tr></thead>
                <tbody>
                  {fabricParts.map((p: any, i: number) => (
                    <tr key={i}><td style={tdS}>{p.part_name || '—'}</td><td style={{ ...tdS, fontFamily: T.mono, textAlign: 'right', color: T.bl, fontWeight: 600 }}>{Number(p.fabric_meter || 0).toFixed(2)}</td></tr>
                  ))}
                  <tr style={{ background: 'rgba(56,189,248,.04)' }}>
                    <td style={{ padding: '8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{t('grandTotal')}</td>
                    <td style={{ padding: '8px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.bl, textAlign: 'right' }}>{fabricFM.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {(workParts.length > 0 || fabricParts.length > 0) && (
          <>
            <div onClick={() => setShowFB(v => !v)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 8, padding: '12px 16px', background: 'rgba(56,189,248,.06)', border: `1px solid rgba(56,189,248,.15)`, borderRadius: 10, cursor: 'pointer' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.tx2 }}>{t('grandFabricTotal')}</span>
              <span style={{ fontFamily: T.sora, fontSize: 18, fontWeight: 700, color: T.bl }}>{(workFM + fabricFM).toFixed(2)} m</span>
              <span style={{ fontSize: 10, color: T.tx3, transform: showFB ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .15s' }}>▶</span>
            </div>
            {showFB && <FabricBreakdown items={fbItems} t={t} />}
          </>
        )}
        <div style={{ textAlign: 'center', fontSize: 9, color: T.tx3, opacity: 0.4, marginTop: 20, paddingBottom: 20 }}>{t('poweredBy')}</div>
      </div>
    </div>
  );
}
