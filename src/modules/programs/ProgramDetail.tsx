import { useState, useEffect } from 'react';
import { T, S, Pill } from '../../lib/theme';
import { fetchProgramById, fetchMatchings } from './lib/supabase-rpc';
import { toDirectImageUrl } from './lib/image-url-converters';
import ProgramPriceEditor from './ProgramPriceEditor';
import ProgramHistory from './ProgramHistory';
import VoiceRecorder from './VoiceRecorder';
import type { Program, ProgramMatching } from './types';
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
  const [tab, setTab] = useState<'price' | 'history'>('price');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: m }] = await Promise.all([
      fetchProgramById(programId),
      fetchMatchings(programId),
    ]);
    setProgram(p);
    setMatchings(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, [programId]);

  if (loading || !program) return <div style={{ padding: 30, textAlign: 'center', color: T.tx3 }}>{t('loading')}</div>;

  const label: React.CSSProperties = { fontSize: 8, color: T.tx3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 };
  const val: React.CSSProperties = { fontSize: 12, color: T.tx, fontWeight: 500 };
  const imageUrl = program.dropbox_gdrive_link ? toDirectImageUrl(program.dropbox_gdrive_link) : null;

  return (
    <div style={{ fontFamily: T.sans, color: T.tx, padding: '14px 16px', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, fontFamily: T.sora }}>{program.program_uid}</span>
          {program.selling_sku && <Pill tone="ac">{program.selling_sku}</Pill>}
          {program.manufacturing_sku && <Pill tone="bl">{program.manufacturing_sku}</Pill>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onEdit(program, matchings.map(m => ({ company_name: m.company_name, matching_label: m.matching_label || '' })))}
            style={{ ...S.btnPrimary, fontSize: 10, padding: '5px 12px', cursor: 'pointer' }}>{t('edit')}</button>
          <button onClick={onClose} style={{ ...S.btnGhost, fontSize: 10, padding: '5px 12px', cursor: 'pointer' }}>{t('cancel')}</button>
        </div>
      </div>

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div><div style={label}>{t('sellingSkuLabel')}</div><div style={{ ...val, fontFamily: T.mono }}>{program.selling_sku || '—'}</div></div>
        <div><div style={label}>{t('manufacturingSkuLabel')}</div><div style={{ ...val, fontFamily: T.mono }}>{program.manufacturing_sku || '—'}</div></div>
        <div><div style={label}>{t('matchingLabel')}</div><div style={val}>{program.matching || '—'}</div></div>
      </div>

      {/* Image preview */}
      {imageUrl && (
        <div style={{ marginBottom: 14, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8, padding: 10 }}>
          <div style={label}>{t('linkLabel')}</div>
          <img src={imageUrl} alt="Program image" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, objectFit: 'contain' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <a href={program.dropbox_gdrive_link || ''} target="_blank" rel="noopener" style={{ fontSize: 10, color: T.ac2, display: 'block', marginTop: 4 }}>Open original link</a>
        </div>
      )}

      {/* Matchings / Companies */}
      {matchings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={label}>{t('companiesForMatching')} ({matchings.length})</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {matchings.map(m => (
              <Pill key={m.id} tone="ac" dot>{m.company_name}{m.matching_label ? ` · ${m.matching_label}` : ''}</Pill>
            ))}
          </div>
        </div>
      )}

      {/* Voice note */}
      <VoiceRecorder programId={programId} existingPath={program.voice_note_path} onUploaded={() => load()} t={t} />

      {/* Tabs: Price | History */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, padding: 3, background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
        {(['price', 'history'] as const).map(id => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: tab === id ? 600 : 500, fontFamily: T.sans,
            background: tab === id ? 'rgba(99,102,241,.15)' : 'transparent',
            color: tab === id ? T.ac2 : T.tx2, transition: T.transition,
          }}>{id === 'price' ? t('priceBreakdown') : t('history')}</button>
        ))}
      </div>

      {tab === 'price' && <ProgramPriceEditor programId={programId} t={t} />}
      {tab === 'history' && <ProgramHistory programId={programId} t={t} />}
    </div>
  );
}
