import type React from 'react';

export const T = {
  bg: '#060810', s: '#0B0F19', s2: '#0F1420', s3: '#141B2B',
  bd: 'rgba(255,255,255,0.05)', bd2: 'rgba(255,255,255,0.08)',
  tx: '#E2E8F0', tx2: '#8896B0', tx3: '#4A5568',
  ac: '#6366F1', ac2: '#818CF8',
  gr: '#22C55E', re: '#EF4444', bl: '#38BDF8', yl: '#F59E0B',
  r: 8, mono: "'JetBrains Mono', monospace", sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",
  glass1: 'rgba(255,255,255,0.02)', glass2: 'rgba(255,255,255,0.04)',
  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
};

export const S = {
  fLabel: { display: 'block', fontSize: 10, fontWeight: 600, color: T.tx3, marginBottom: 5, letterSpacing: '0.06em', textTransform: 'uppercase' as const } as React.CSSProperties,
  fInput: { width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx, fontFamily: T.sans, fontSize: 12, padding: '7px 10px', outline: 'none', transition: T.transition } as React.CSSProperties,
  btnPrimary: { padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: T.sans, background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5, boxShadow: '0 2px 10px rgba(99,102,241,0.25)', transition: T.transition, whiteSpace: 'nowrap' as const, letterSpacing: '0.02em' } as React.CSSProperties,
  btnGhost: { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.15)', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: T.sans, background: 'rgba(99,102,241,0.06)', color: T.ac2, display: 'inline-flex', alignItems: 'center', gap: 5, transition: T.transition, whiteSpace: 'nowrap' as const } as React.CSSProperties,
  btnDanger: { padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.18)', cursor: 'pointer', fontSize: 10, fontWeight: 500, fontFamily: T.sans, background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', transition: T.transition, whiteSpace: 'nowrap' as const } as React.CSSProperties,
  btnSm: { padding: '3px 8px', fontSize: 10 } as React.CSSProperties,
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.80)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 8 } as React.CSSProperties,
  modalBox: { background: 'rgba(14,18,30,0.96)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: `1px solid ${T.bd2}`, borderRadius: 14, width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 24px 80px rgba(0,0,0,.65)', padding: 0 } as React.CSSProperties,
  modalHead: { padding: '13px 18px', borderBottom: `1px solid ${T.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as React.CSSProperties,
  thStyle: { fontSize: 9, color: T.tx3, padding: '9px 12px', textAlign: 'left' as const, fontWeight: 600, borderBottom: `1px solid ${T.bd}`, background: 'rgba(255,255,255,0.015)', textTransform: 'uppercase' as const, letterSpacing: '0.1em', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  tdStyle: { padding: '9px 12px', fontSize: 12, borderBottom: `1px solid ${T.bd}`, color: T.tx2 } as React.CSSProperties,
};
