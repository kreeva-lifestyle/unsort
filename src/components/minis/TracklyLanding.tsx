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

// Same DailyOffice "D" brand mark as the login page — just a Matrix-green
// color touch (green gradient + glow) instead of the indigo→cyan original.
function AryaLogo() {
  return (
    <div style={{
      width: 64, height: 64, margin: '0 auto', borderRadius: 16,
      background: 'linear-gradient(135deg, #16A34A, #22C55E)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Sora, Inter, sans-serif', fontWeight: 800, fontSize: 32, color: '#fff',
      boxShadow: '0 10px 30px rgba(34,197,94,0.35), 0 0 40px rgba(34,197,94,0.25)',
    }}>
      D
    </div>
  );
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
            <AryaLogo />

            <div style={{
              fontFamily: 'Sora, Inter, sans-serif', fontSize: 22, fontWeight: 700,
              color: '#22C55E', marginTop: 18, marginBottom: 6, letterSpacing: '0.04em',
              textShadow: '0 0 18px rgba(34,197,94,0.45)',
            }}>
              ARYA DESIGNS
            </div>

            <div style={{
              fontSize: 14, color: 'rgba(226,232,240,0.82)', lineHeight: 1.6, fontWeight: 500,
              marginBottom: 28, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto',
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
