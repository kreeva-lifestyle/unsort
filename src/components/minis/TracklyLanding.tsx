import { useEffect, useRef, useState, useCallback } from 'react';
import { T } from '../../lib/theme';

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function MatrixCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = ref.current!;
    const ctx = cvs.getContext('2d')!;
    let raf = 0;
    const fontSize = window.innerWidth < 500 ? 12 : 16;
    const resize = () => { cvs.width = window.innerWidth; cvs.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const cols = Math.floor(cvs.width / fontSize);
    const drops = Array.from({ length: cols }, () => Math.random() * -50);
    let last = 0;
    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 45) return;
      last = ts;
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.font = `${fontSize}px JetBrains Mono, monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
        const y = drops[i] * fontSize;
        const brightness = Math.random() > 0.92 ? '#fff' : `rgba(34,197,94,${0.4 + Math.random() * 0.6})`;
        ctx.fillStyle = brightness;
        ctx.fillText(ch, i * fontSize, y);
        if (y > cvs.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, zIndex: 0 }} />;
}

// The real Arya Designs logo (gold AD crest + wordmark), recolored into the
// Matrix phosphor palette so it belongs in the green code rain instead of
// floating on top of it. Technique: the PNG's alpha channel is used as a CSS
// mask over a green gradient (bright phosphor top → deep green bottom, the way
// Matrix glyphs glow brightest at the leading edge). True #22C55E green with
// no hue-rotate guesswork, ornate filigree preserved via the alpha edges, and
// a gentle CRT flicker glow. The logo already contains the wordmark, so no
// separate text heading is rendered.
const LOGO_MASK = {
  WebkitMaskImage: 'url(/arya-designs-logo.png)',
  maskImage: 'url(/arya-designs-logo.png)',
  WebkitMaskSize: 'contain',
  maskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
} as const;

function AryaLogo() {
  return (
    <div role="img" aria-label="Arya Designs" style={{
      position: 'relative', width: '54%', maxWidth: 156, aspectRatio: '1536 / 1088', margin: '0 auto',
      animation: 'aryaJelly 1.1s cubic-bezier(.2,1.3,.35,1) both',
      willChange: 'transform',
    }}>
      {/* Soft phosphor glow — masked + blurred, breathes via opacity (composited, no repaint) */}
      <div style={{
        position: 'absolute', inset: 0, background: '#22C55E',
        filter: 'blur(9px)', opacity: 0.6, transform: 'scale(1.04)',
        animation: 'aryaGlowPulse 3.4s ease-in-out infinite', willChange: 'opacity',
        ...LOGO_MASK,
      }} />
      {/* Main logo — glossy green gradient + static emboss bevel (dark below, light above) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(177deg, #D1FAE0 0%, #6EE7A8 22%, #22C55E 56%, #16A34A 80%, #0E6B33 100%)',
        filter: 'drop-shadow(0 1.5px 0.5px rgba(0,0,0,0.55)) drop-shadow(0 -1px 0.5px rgba(209,250,224,0.55))',
        ...LOGO_MASK,
      }} />
      {/* Gloss sheen — bright streak sweeping across, clipped to the logo shape */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...LOGO_MASK }}>
        <div style={{
          position: 'absolute', top: '-20%', bottom: '-20%', left: 0, width: '32%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
          animation: 'aryaSheen 5s ease-in-out infinite', willChange: 'transform',
        }} />
      </div>
    </div>
  );
}

interface Props { longUrl: string; onImport: () => void }

export default function TracklyLanding({ longUrl, onImport }: Props) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 600); return () => clearTimeout(t); }, []);
  const redirect = useCallback(() => window.location.replace(longUrl), [longUrl]);
  // Convert a Google Sheets edit URL to its direct xlsx export endpoint so the
  // browser downloads the file (export?format=xlsx returns it as an attachment).
  const sheetId = longUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  const downloadSheet = useCallback(() => {
    if (!sheetId) { window.open(longUrl, '_blank'); return; }
    const a = document.createElement('a');
    a.href = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    a.rel = 'noopener';
    a.click();
  }, [sheetId, longUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', fontFamily: T.sans }}>
      <MatrixCanvas />
      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', minHeight: '100vh', padding: '24px 16px',
      }}>
        <div style={{
          opacity: show ? 1 : 0, transform: show ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.96)',
          transition: 'all 0.8s cubic-bezier(.16,1,.3,1)', maxWidth: 440, width: '100%',
        }}>
          <div style={{
            background: 'rgba(6,8,16,0.82)', border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: 16, padding: '36px 28px 32px', textAlign: 'center',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 0 80px rgba(34,197,94,0.08), 0 0 2px rgba(34,197,94,0.3)',
          }}>
            <AryaLogo />

            <div style={{
              fontSize: 14, color: 'rgba(226,232,240,0.82)', lineHeight: 1.6, fontWeight: 500,
              marginTop: 22, marginBottom: 28, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto',
            }}>
              Take the green pill.<br />See <span style={{ color: '#22C55E', fontWeight: 600 }}>our stock status</span> in real time.
            </div>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button onClick={onImport}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.55)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(34,197,94,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
                style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.3)',
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))',
                  color: '#22C55E', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', minHeight: 48, transition: 'all 0.2s',
                  letterSpacing: '0.01em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                Self Import
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
              <button onClick={redirect}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(129,140,248,0.4)'; e.currentTarget.style.color = '#818CF8'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(226,232,240,0.1)'; e.currentTarget.style.color = 'rgba(226,232,240,0.7)'; }}
                style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10, border: '1px solid rgba(226,232,240,0.1)',
                  background: 'rgba(226,232,240,0.04)', color: 'rgba(226,232,240,0.7)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  minHeight: 48, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                Redirect to GSheet
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>
              </button>
              <button onClick={downloadSheet}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(129,140,248,0.4)'; e.currentTarget.style.color = '#818CF8'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(226,232,240,0.1)'; e.currentTarget.style.color = 'rgba(226,232,240,0.7)'; }}
                style={{
                  width: '100%', padding: '13px 20px', borderRadius: 10, border: '1px solid rgba(226,232,240,0.1)',
                  background: 'rgba(226,232,240,0.04)', color: 'rgba(226,232,240,0.7)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  minHeight: 48, transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                Download Sheet
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
