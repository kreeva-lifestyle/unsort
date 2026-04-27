import { useState, useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';
import { T, S } from '../../lib/theme';
import { generateShareToken } from './lib/supabase-rpc';
import { getShareUrl } from './lib/share-token';
import { useNotifications } from '../../hooks/useNotifications';
import type { Program } from './types';
import type { TranslationKey } from './i18n/en';

interface Props {
  program: Program;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

export default function QRGenerator({ program, onClose, t }: Props) {
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { addToast } = useNotifications();

  // Escape key to dismiss
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      let token = program.share_token;
      if (!token) {
        setLoading(true);
        const { token: newToken, error } = await generateShareToken(program.id);
        setLoading(false);
        if (error || !newToken) { addToast(t('qrFailed'), 'error'); return; }
        token = newToken;
      }
      const url = getShareUrl(token);
      setShareUrl(url);
      renderQR(url);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id, program.share_token]);

  const renderQR = async (text: string) => {
    if (!canvasRef.current) return;
    try {
      await QRCodeLib.toCanvas(canvasRef.current, text, {
        width: 220, margin: 2, color: { dark: '#E8EEF7', light: '#060810' },
      });
    } catch (e) {
      console.error('QR render failed:', e);
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        canvasRef.current.width = 220;
        canvasRef.current.height = 220;
        ctx.fillStyle = '#0F1420';
        ctx.fillRect(0, 0, 220, 220);
        ctx.fillStyle = '#9AA8C2';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(t('qrError'), 110, 100);
        ctx.fillText(t('contactSupport'), 110, 120);
      }
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); addToast(t('copied'), 'success'); }
    catch { addToast(shareUrl, 'info'); }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const a = document.createElement('a');
    a.download = `${program.program_uid}-QR.png`;
    a.href = canvasRef.current.toDataURL('image/png');
    a.click();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)', padding: 16 }} onClick={onClose}>
      <div style={{ background: 'rgba(14,18,30,.96)', border: `1px solid ${T.bd2}`, borderRadius: 14, padding: '20px 24px', maxWidth: 320, width: '100%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.modalTitle, marginBottom: 14 }}>{t('qr')} — {program.program_uid}</div>

        {loading ? (
          <div style={{ padding: 40, color: T.tx3, fontSize: 11 }}>{t('loading')}</div>
        ) : (
          <>
            <canvas ref={canvasRef} style={{ borderRadius: 8, border: `1px solid ${T.bd2}` }} />

            {shareUrl && (
              <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${T.bd}`, borderRadius: 6, wordBreak: 'break-all', fontSize: 10, color: T.tx2, fontFamily: T.mono, userSelect: 'all', cursor: 'text' }}>
                {shareUrl}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={handleCopy} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', cursor: 'pointer' }}>{t('copyLink')}</button>
              <button onClick={handleDownload} style={{ ...S.btnPrimary, flex: 1, justifyContent: 'center', cursor: 'pointer' }}>{t('downloadPng')}</button>
            </div>
          </>
        )}

        <button onClick={onClose} style={{ ...S.btnGhost, marginTop: 10, width: '100%', justifyContent: 'center', cursor: 'pointer' }}>{t('cancel')}</button>
      </div>
    </div>
  );
}
