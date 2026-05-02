// ============================================================
// DailyOffice — shared theme tokens + style recipes + Icon
//
// Single source of truth. Replaces the duplicated `const T = {...}`
// blocks at the top of App.tsx, BrandTagPrinter.tsx, CashBook.tsx,
// CashChallan.tsx, InventoryExtras.tsx, PackTime.tsx.
//
// Drop this file into `src/theme.ts` and in each of the 6 files:
//
//   - DELETE the local `const T = {...}` block
//   - DELETE the local `const S = {...}` block (App.tsx only)
//   - DELETE the local `const Icon` component (App.tsx only)
//   - Add at the top, next to the other imports:
//         import { T, S, Icon } from './theme';
//
// Every call-site reads `T.bg`, `T.ac`, `S.fInput`, `<Icon name="…" />`
// exactly as before — no call-site changes required.
// ============================================================

import React from 'react';

// ─── Design tokens (superset of all 6 duplicated `T` objects) ────────────
export const T = {
  // Surfaces
  bg:  '#060810',
  s:   '#0B0F19',
  s2:  '#0F1420',
  s3:  '#141B2B',
  glass1: 'rgba(255,255,255,0.02)',
  glass2: 'rgba(255,255,255,0.04)',

  // Borders
  bd:  'rgba(255,255,255,0.05)',
  bd2: 'rgba(255,255,255,0.08)',

  // Text
  tx:  '#E2E8F0',
  tx2: '#8896B0',
  tx3: '#6B7890',

  // Accent
  ac:  '#6366F1',
  ac2: '#818CF8',
  ac3: 'rgba(99,102,241,0.12)',

  // Semantic
  gr:  '#22C55E',
  re:  '#EF4444',
  yl:  '#F59E0B',
  bl:  '#38BDF8',

  // Radii
  r:   8,
  rXs: 4,
  rSm: 6,
  rMd: 8,
  rLg: 10,
  rXl: 14,

  // Type families
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', -apple-system, sans-serif",
  sora: "'Sora', 'Inter', sans-serif",

  // Motion
  transition: 'all 180ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ─── Shared style recipes (from App.tsx `const S`) ──────────────────────
export const S = {
  fLabel: {
    display: 'block', fontSize: 11, fontWeight: 600, color: T.tx3,
    marginBottom: 5, letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  fInput: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx,
    fontFamily: T.sans, fontSize: 13, padding: '8px 12px', height: 36,
    outline: 'none', transition: T.transition,
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  fSearch: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${T.bd}`, borderRadius: 8, color: T.tx,
    fontFamily: T.sans, fontSize: 12, padding: '8px 12px 8px 34px',
    outline: 'none', transition: T.transition,
    boxSizing: 'border-box' as const, height: 36,
  } as React.CSSProperties,

  btnPrimary: {
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: T.sans,
    background: 'linear-gradient(135deg, rgba(99,102,241,.87), rgba(129,140,248,.80))',
    color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5,
    boxShadow: '0 2px 10px rgba(99,102,241,0.25)',
    transition: T.transition,
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  btnGhost: {
    padding: '8px 14px', borderRadius: 8,
    border: `1px solid rgba(99,102,241,0.15)`,
    cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: T.sans,
    background: 'rgba(99,102,241,0.06)', color: T.ac2,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    transition: T.transition,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  btnDanger: {
    padding: '8px 14px', borderRadius: 8,
    border: '1px solid rgba(239,68,68,0.20)',
    cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: T.sans,
    background: 'rgba(239,68,68,0.08)', color: T.re,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    transition: T.transition,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  btnSm: { padding: '4px 10px', fontSize: 10, borderRadius: 5 } as React.CSSProperties,
  btnLg: { padding: '10px 18px', fontSize: 13, height: 40 } as React.CSSProperties,

  fDate: {
    background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.bd}`,
    borderRadius: 6, color: T.tx, fontSize: 12, padding: '6px 10px',
    outline: 'none', height: 32, boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  modalOverlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.80)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)', padding: 8,
  } as React.CSSProperties,

  modalBox: {
    background: 'rgba(14,18,30,0.96)',
    backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
    border: `1px solid ${T.bd2}`, borderRadius: 14,
    width: 480, maxWidth: '100%', maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 24px 80px rgba(0,0,0,.65)', padding: 0,
  } as React.CSSProperties,

  modalHead: {
    padding: '16px 18px', borderBottom: `1px solid ${T.bd}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  } as React.CSSProperties,

  modalTitle: {
    fontFamily: T.sora, fontSize: 14, fontWeight: 700, color: T.tx, margin: 0,
  } as React.CSSProperties,

  errorBox: {
    background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)',
    borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.re,
  } as React.CSSProperties,

  successBox: {
    background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.2)',
    borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.gr,
  } as React.CSSProperties,

  warningBox: {
    background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)',
    borderRadius: 6, padding: '8px 10px', fontSize: 11, color: T.yl,
  } as React.CSSProperties,

  thStyle: {
    fontSize: 10, color: T.tx3, padding: '11px 14px',
    textAlign: 'left' as const, fontWeight: 600,
    borderBottom: `1px solid ${T.bd}`,
    background: 'rgba(255,255,255,0.015)',
    textTransform: 'uppercase' as const, letterSpacing: '0.1em',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  tdStyle: {
    padding: '11px 14px', fontSize: 13,
    borderBottom: `1px solid ${T.bd}`, color: T.tx2,
  } as React.CSSProperties,
};

// ─── Pill (status / aging / attention chip) ─────────────────────────────
// Reusable chip used in dashboard alerts, status badges, ledger aging.
// Existing inline status badges keep working — Pill is opt-in for new code.
type PillTone = 'neutral' | 'gr' | 'yl' | 're' | 'bl' | 'ac';
const PILL_TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  neutral: { bg: 'rgba(255,255,255,.04)', fg: T.tx2, bd: T.bd },
  gr:      { bg: 'rgba(34,197,94,.10)',   fg: '#4ADE80', bd: 'rgba(34,197,94,.25)' },
  yl:      { bg: 'rgba(245,158,11,.10)',  fg: '#FCD34D', bd: 'rgba(245,158,11,.25)' },
  re:      { bg: 'rgba(239,68,68,.10)',   fg: '#FCA5A5', bd: 'rgba(239,68,68,.25)' },
  bl:      { bg: 'rgba(56,189,248,.10)',  fg: '#7DD3FC', bd: 'rgba(56,189,248,.25)' },
  ac:      { bg: T.ac3,                    fg: T.ac2, bd: 'rgba(99,102,241,.25)' },
};
export const Pill = ({ tone = 'neutral', dot, children, style }: { tone?: PillTone; dot?: boolean; children: React.ReactNode; style?: React.CSSProperties }) => {
  const t = PILL_TONES[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, background: t.bg, color: t.fg, border: `1px solid ${t.bd}`, fontSize: 11, fontWeight: 500, fontFamily: T.sans, letterSpacing: '0.01em', whiteSpace: 'nowrap' as const, ...style }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: t.fg, flexShrink: 0 }} />}
      {children}
    </span>
  );
};

// ─── Icon (from App.tsx) ────────────────────────────────────────────────
// 12 hand-rolled 24×24 stroke-1.8 icons. For anything not here,
// use Lucide at stroke-width 1.8.
const ICON_PATHS: Record<string, string> = {
  grid:     'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  box:      'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5M12 22V13M21 8l-9 5',
  tag:      'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  pin:      'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0zM12 7a3 3 0 100 6 3 3 0 000-6z',
  file:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  users:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  search:   'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  scan:     'M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M8 12h8',
  check:    'M20 6L9 17l-5-5',
  link:     'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  settings: 'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2zM12 15a3 3 0 100-6 3 3 0 000 6z',
};

export const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const s: React.CSSProperties = {
    width: size, height: size, fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return <svg viewBox="0 0 24 24" style={s}><path d={ICON_PATHS[name] || ''} /></svg>;
};
