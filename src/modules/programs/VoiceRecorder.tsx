import { T, S } from '../../lib/theme';
import { useVoiceRecorder } from './hooks/useVoiceRecorder';
import { uploadVoiceNote, getVoiceNoteUrl } from './lib/supabase-rpc';
import { supabase } from '../../lib/supabase';
import { useNotifications } from '../../hooks/useNotifications';
import { useState, useEffect, useRef } from 'react';
import type { TranslationKey } from './i18n/en';

interface Props {
  programId: string;
  existingPath: string | null;
  onUploaded: (path: string) => void;
  t: (key: TranslationKey) => string;
}

export default function VoiceRecorder({ programId, existingPath, onUploaded, t }: Props) {
  const { recording, audioUrl, audioBlob, duration, error, start, stop, clear, ext } = useVoiceRecorder();
  const { addToast } = useNotifications();
  const [uploading, setUploading] = useState(false);
  const existingUrl = existingPath ? getVoiceNoteUrl(existingPath) : null;

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const uploadedRef = useRef(false);

  // Auto-upload when recording stops and blob is ready
  useEffect(() => {
    if (!audioBlob || uploading || uploadedRef.current) return;
    uploadedRef.current = true;
    (async () => {
      setUploading(true);
      const { path, error: upErr } = await uploadVoiceNote(programId, audioBlob, ext());
      setUploading(false);
      if (upErr || !path) { addToast('Upload failed', 'error'); uploadedRef.current = false; return; }
      addToast(t('voiceUpload'), 'success');
      onUploaded(path);
      clear();
    })();
  }, [audioBlob, programId, ext, uploading, addToast, t, onUploaded, clear]);

  const btnBase: React.CSSProperties = {
    width: 44, height: 44, borderRadius: 22, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: T.transition,
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={S.fLabel}>{t('voiceNote')}</label>

      {/* Existing voice note playback */}
      {existingUrl && !audioUrl && !recording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 8 }}>
          <audio controls src={existingUrl} style={{ flex: 1, height: 32 }} />
          <button onClick={async () => {
            if (!confirm('Remove this voice note?')) return;
            if (existingPath) {
              await supabase.storage.from('program-voice-notes').remove([existingPath]);
            }
            await supabase.from('programs').update({ voice_note_path: null, updated_at: new Date().toISOString() }).eq('id', programId);
            onUploaded('');
            addToast('Voice note removed', 'success');
          }} style={{ ...S.btnDanger, ...S.btnSm, fontSize: 9, padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}>Remove</button>
        </div>
      )}

      {/* Recorder controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {!recording && !audioUrl && (
          <button onClick={start} style={{ ...btnBase, background: T.re, color: '#fff' }} title={t('record')}>
            <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: '#fff' }}><circle cx="12" cy="12" r="6" /></svg>
          </button>
        )}
        {recording && (
          <>
            <button onClick={stop} style={{ ...btnBase, background: T.re, color: '#fff', animation: 'subtlePulse 1.5s ease-in-out infinite' }} title={t('stop')}>
              <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, fill: '#fff' }}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
            <span style={{ fontFamily: T.mono, fontSize: 14, color: T.re, fontWeight: 600, minWidth: 40 }}>{formatTime(duration)}</span>
            <span style={{ fontSize: 10, color: T.re, fontWeight: 500 }}>{t('recording')}</span>
          </>
        )}
        {audioUrl && !recording && (
          <>
            {uploading ? (
              <span style={{ fontSize: 10, color: T.ac2, fontWeight: 500 }}>{t('saving')}</span>
            ) : (
              <>
                <audio controls src={audioUrl} style={{ height: 32 }} />
                <button onClick={() => { uploadedRef.current = false; clear(); }} style={{ ...S.btnGhost, ...S.btnSm, fontSize: 9, cursor: 'pointer' }}>{t('reRecord')}</button>
              </>
            )}
          </>
        )}
      </div>

      {/* File upload fallback */}
      {!recording && !audioUrl && (
        <div style={{ marginTop: 6 }}>
          <label style={{ ...S.btnGhost, fontSize: 10, padding: '4px 10px', cursor: 'pointer', display: 'inline-flex' }}>
            {t('upload')}
            <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              const fileExt = file.name.split('.').pop() || 'webm';
              const { path, error: upErr } = await uploadVoiceNote(programId, file, fileExt);
              setUploading(false);
              if (upErr || !path) { addToast('Upload failed', 'error'); return; }
              addToast(t('voiceUpload'), 'success');
              onUploaded(path);
            }} />
          </label>
        </div>
      )}

      {error && <div style={{ ...S.errorBox, marginTop: 6 }}>{error}</div>}
      {!existingUrl && !audioUrl && !recording && <div style={{ fontSize: 10, color: T.tx3, marginTop: 4 }}>{t('noVoiceNote')}</div>}
    </div>
  );
}
