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

interface Props { longUrl: string; onImport: () => void }

export default function TracklyLanding({ longUrl, onImport }: Props) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 600); return () => clearTimeout(t); }, []);
  const redirect = useCallback(() => window.location.replace(longUrl), [longUrl]);

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
            <div style={{
              width: 56, height: 56, margin: '0 auto 18px', borderRadius: 14,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#22C55E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>

            <div style={{
              fontFamily: 'Sora, Inter, sans-serif', fontSize: 20, fontWeight: 700,
              color: '#22C55E', marginBottom: 6, letterSpacing: '-0.02em',
            }}>
              Arya Designs
            </div>

            <div style={{
              fontSize: 13, color: 'rgba(226,232,240,0.7)', lineHeight: 1.7,
              marginBottom: 28, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto',
            }}>
              You are about to experience the best inventory stock update from the one and only{' '}
              <span style={{ color: '#22C55E', fontWeight: 600 }}>Arya Designs</span>.
            </div>

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button onClick={onImport} style={{
                width: '100%', padding: '13px 20px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.3)',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
                color: '#22C55E', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', minHeight: 48, transition: 'all 0.2s',
                letterSpacing: '0.01em',
              }}>
                Self Import
              </button>
              <button onClick={redirect} style={{
                width: '100%', padding: '13px 20px', borderRadius: 10, border: '1px solid rgba(226,232,240,0.1)',
                background: 'rgba(226,232,240,0.04)', color: 'rgba(226,232,240,0.7)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                minHeight: 48, transition: 'all 0.2s',
              }}>
                Redirect to GSheet
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
