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
  tx3: '#6B7890',  // was #4A5568 — bumped for WCAG contrast (audit P1)

  // Accent
  ac:  '#6366F1',
  ac2: '#818CF8',

  // Semantic
  gr:  '#22C55E',   // success / complete
  re:  '#EF4444',   // danger / damaged
  yl:  '#F59E0B',   // warn / unsorted
  bl:  '#38BDF8',   // info / cash-in-hand

  // Shape
  r:   8,

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
    width: '100%', background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${T.bd}`, borderRadius: 6, color: T.tx,
    fontFamily: T.sans, fontSize: 13, padding: '8px 10px',
    outline: 'none', transition: T.transition,
  } as React.CSSProperties,

  btnPrimary: {
    padding: '6px 13px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: T.sans,
    background: `linear-gradient(135deg, ${T.ac}dd, ${T.ac2}cc)`,
    color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5,
    boxShadow: '0 2px 10px rgba(99,102,241,0.25)',
    transition: T.transition,
    whiteSpace: 'nowrap' as const,
    letterSpacing: '0.02em',
  } as React.CSSProperties,

  btnGhost: {
    padding: '6px 13px', borderRadius: 6,
    border: `1px solid rgba(99,102,241,0.15)`,
    cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: T.sans,
    background: 'rgba(99,102,241,0.06)', color: T.ac2,
    display: 'inline-flex', alignItems: 'center', gap: 5,
    transition: T.transition,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  btnDanger: {
    padding: '5px 11px', borderRadius: 6,
    border: '1px solid rgba(239,68,68,0.18)',
    cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: T.sans,
    background: 'rgba(239,68,68,0.08)', color: '#FCA5A5',
    transition: T.transition,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  btnSm: { padding: '3px 8px', fontSize: 11 } as React.CSSProperties,

  modalOverlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.80)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)', padding: 8,
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
    padding: '13px 18px', borderBottom: `1px solid ${T.bd}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  } as React.CSSProperties,

  thStyle: {
    fontSize: 10, color: T.tx3, padding: '10px 12px',
    textAlign: 'left' as const, fontWeight: 600,
    borderBottom: `1px solid ${T.bd}`,
    background: 'rgba(255,255,255,0.015)',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  tdStyle: {
    padding: '10px 12px', fontSize: 13,
    borderBottom: `1px solid ${T.bd}`, color: T.tx2,
  } as React.CSSProperties,
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
