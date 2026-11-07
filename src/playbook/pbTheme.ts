// Playbook "V2 · Bento glass" tokens and recipes (DESIGN.md §2–§5, amended
// 2026-11-05 for contrast). Components use these names, never literals.
// Values that differ by width or pointer are CSS variables set in
// src/index.css (the "Playbook V2" block); the recipes reference them.
import type { CSSProperties } from 'react';
import { T } from '../lib/theme';

const brandA = 'oklch(0.84 0.15 78)';
const brandB = 'oklch(0.64 0.21 28)';

export const PB = {
  bg: 'oklch(0.10 0.03 270)',
  glowAmber: 'oklch(0.70 0.17 60 / .30)',
  glowCoral: 'oklch(0.62 0.20 25 / .32)',
  glowIndigo: 'oklch(0.50 0.14 280 / .40)',
  tile: 'oklch(1 0 0 / 0.06)',
  tilePhone: 'oklch(1 0 0 / 0.07)',
  tileBd: 'oklch(1 0 0 / 0.12)',
  tileHi: 'inset 0 1px 0 oklch(1 0 0 / 0.10)',
  brandA, brandB,
  brand: `linear-gradient(135deg, ${brandA}, ${brandB})`,
  onBrand: 'oklch(0.16 0.03 40)',
  tx: 'oklch(0.96 0.01 250)',
  tx2: 'oklch(0.86 0.02 255)',
  tx3: 'oklch(0.78 0.02 255)',
  live: 'oklch(0.80 0.17 150)',
  review: 'oklch(0.84 0.15 75)',
  failed: 'oklch(0.78 0.16 25)',
  busy: 'oklch(0.78 0.12 235)',
  focus: 'oklch(0.90 0.10 85)',
  onActive: 'oklch(0.99 0.01 80)',
  reviewBg: 'oklch(0.80 0.15 75 / .12)',
  reviewBd: 'oklch(0.85 0.12 75 / .35)',
  failedBg: 'oklch(0.62 0.2 25 / .16)',
  failedBd: 'oklch(0.75 0.15 25 / .4)',
  liveBg: 'oklch(0.80 0.17 150 / .10)',
  liveBd: 'oklch(0.80 0.17 150 / .30)',
  /** Outline on the hero gradient (secondary button there). */
  onBrandBd: 'oklch(0.16 0.03 40 / .45)',
  activeBd: 'oklch(1 0 0 / .30)',
  activeBar: 'oklch(0.72 0.19 40)',
  activeGlow: 'oklch(0.64 0.21 28 / .22)',
  activeFill: 'linear-gradient(180deg, oklch(1 0 0 / .16), oklch(1 0 0 / .06))',
  ctl: 'oklch(1 0 0 / .06)',
  ctlBd: 'oklch(1 0 0 / .14)',
  inputBd: 'oklch(1 0 0 / .36)',
  dangerBd: 'oklch(0.75 0.15 25 / .4)',
  dangerTx: 'oklch(0.88 0.08 25)',
  bar: 'oklch(1 0 0 / .08)',
  sheet: 'oklch(0.16 0.03 270 / .82)',
  scrim: 'oklch(0.06 0.02 270 / .55)',
  handle: 'oklch(1 0 0 / .28)',
  skelBar: 'oklch(1 0 0 / .08)',
  rowHover: 'oklch(1 0 0 / .04)',
  lift: '0 18px 40px oklch(0.05 0.03 270 / .45)',
  tileSolid: 'oklch(0.18 0.03 270 / .92)',
  sheetSolid: 'oklch(0.16 0.03 270 / .97)',
  barSolid: 'oklch(0.16 0.03 270 / .95)',
  // Type (DESIGN.md §3). Inter + Devanagari fallback for mixed Hindi names.
  sans: "Inter, 'Noto Sans Devanagari', system-ui, sans-serif",
  sora: T.sora,
  mono: T.mono,
  // The only radii (DESIGN.md §5).
  r: { pill: 999, sheet: 30, heroDesk: 28, bar: 26, tileDesk: 24, heroPhone: 24, tilePhone: 22, row: 20, btn: 18, photo: 16, toast: 16, input: 14, skel: 8, chartBar: 4, handle: 3 },
} as const;

/** Chart palette (design/data-and-charts.md §2). Store slots are fixed per website. */
export const PB_VIZ = {
  store: ['oklch(0.60 0.14 60)', 'oklch(0.64 0.11 190)', 'oklch(0.60 0.17 295)', 'oklch(0.66 0.14 118)', 'oklch(0.60 0.18 345)', 'oklch(0.58 0.15 262)'],
  seq: ['oklch(0.40 0.08 70)', 'oklch(0.48 0.10 70)', 'oklch(0.57 0.12 70)', 'oklch(0.66 0.13 70)', 'oklch(0.75 0.14 72)', 'oklch(0.84 0.13 75)', 'oklch(0.92 0.07 80)'],
  div: {
    cool: ['oklch(0.70 0.13 268)', 'oklch(0.59 0.14 268)', 'oklch(0.48 0.10 268)'],
    mid: 'oklch(0.40 0.01 270)',
    warm: ['oklch(0.48 0.09 50)', 'oklch(0.59 0.13 50)', 'oklch(0.70 0.14 52)'],
  },
  grid: 'oklch(1 0 0 / .08)',
  axis: 'oklch(1 0 0 / .16)',
  other: 'oklch(0.55 0.02 265)',
} as const;

// Variables that differ by width / pointer / glass support (set in index.css).
const v = {
  tileFill: 'var(--pb-tile-fill)', blur: 'var(--pb-blur)', activeBlur: 'var(--pb-active-blur)',
  rTile: 'var(--pb-r-tile)', rHero: 'var(--pb-r-hero)', rRow: 'var(--pb-r-row)', pad: 'var(--pb-pad-tile)',
  ctlH: 'var(--pb-ctl-h)', btnFs: 'var(--pb-btn-fs)', inputFs: 'var(--pb-input-fs)', iconBtn: 'var(--pb-icon-btn)',
  sheetFill: 'var(--pb-sheet-fill)', sheetBlur: 'var(--pb-sheet-blur)', scrimBlur: 'var(--pb-scrim-blur)',
} as const;

const activeShadow = `inset 0 1px 0 oklch(1 0 0 / .50), inset 0 -1px 0 oklch(1 0 0 / .06), 0 8px 24px ${PB.activeGlow}`;

/** Glass tile without blur: phone tiles, rows, cards in a results grid. */
export const pbTileFlat: CSSProperties = {
  background: v.tileFill, border: `1px solid ${PB.tileBd}`, boxShadow: PB.tileHi,
  borderRadius: v.rTile, padding: v.pad, color: PB.tx, minWidth: 0, boxSizing: 'border-box',
};
/** Glass tile (desktop fixed-layout tiles blur; phone never does — --pb-blur is none there). */
export const pbTile: CSSProperties = { ...pbTileFlat, backdropFilter: v.blur, WebkitBackdropFilter: v.blur };
export const pbTileReview: CSSProperties = { ...pbTile, background: PB.reviewBg, borderColor: PB.reviewBd };
export const pbTileFailed: CSSProperties = { ...pbTile, background: PB.failedBg, borderColor: PB.failedBd };
/** Selected nav item / segment / chip: frosted glass, never a solid fill. */
export const pbActive: CSSProperties = {
  background: PB.activeFill, border: `1px solid ${PB.activeBd}`, color: PB.onActive, fontWeight: 600,
  boxShadow: activeShadow, backdropFilter: v.activeBlur, WebkitBackdropFilter: v.activeBlur,
};
/** Selected item in a side list: pbActive plus the amber inset bar. */
export const pbActiveSide: CSSProperties = { ...pbActive, boxShadow: `inset 3px 0 0 ${PB.activeBar}, ${activeShadow}` };
/** One per page. Opaque stops (it nearly always holds text under 18px). No blur. */
export const pbHero: CSSProperties = {
  background: `linear-gradient(140deg, ${PB.brandA}, ${PB.brandB})`, color: PB.onBrand,
  borderRadius: v.rHero, padding: v.pad, border: 'none', minWidth: 0, boxSizing: 'border-box',
};

const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box',
  minHeight: v.ctlH, padding: '0 16px', fontFamily: PB.sans, fontSize: v.btnFs, fontWeight: 600, lineHeight: 1.5,
  cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', maxWidth: '100%',
};
/** The one gradient button per view. */
export const pbBtnPrimary: CSSProperties = { ...btn, background: PB.brand, color: PB.onBrand, border: 'none', borderRadius: PB.r.btn };
export const pbBtnSecondary: CSSProperties = { ...btn, background: PB.ctl, color: PB.tx, border: `1px solid ${PB.ctlBd}`, borderRadius: PB.r.input };
export const pbBtnDanger: CSSProperties = { ...btn, background: 'transparent', color: PB.dangerTx, border: `1px solid ${PB.dangerBd}`, borderRadius: PB.r.input };
/** Square icon-only button (44 coarse / 36 fine). Needs aria-label. */
export const pbIconBtn: CSSProperties = { ...pbBtnSecondary, width: v.iconBtn, minWidth: v.iconBtn, height: v.iconBtn, minHeight: v.iconBtn, padding: 0, flexShrink: 0 };

/** Text input / select / textarea. Add className="pb-input" for the focus border. */
export const pbInput: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: v.ctlH, padding: '0 14px', borderRadius: PB.r.input,
  background: PB.ctl, border: `1px solid ${PB.inputBd}`, color: PB.tx, fontFamily: PB.sans,
  fontSize: v.inputFs, lineHeight: 1.5, colorScheme: 'dark', minWidth: 0,
};
export const pbTextarea: CSSProperties = { ...pbInput, padding: '12px 14px', resize: 'vertical' };
/** Field / section label: 11px uppercase (write it in sentence case; CSS uppercases it). */
export const pbLabel: CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: PB.tx2, marginBottom: 8, fontFamily: PB.sans,
};
/** Sheet, modal and toast glass. */
export const pbSheet: CSSProperties = {
  background: v.sheetFill, backdropFilter: v.sheetBlur, WebkitBackdropFilter: v.sheetBlur,
  border: `1px solid ${PB.tileBd}`, boxShadow: `${PB.tileHi}, ${PB.lift}`, color: PB.tx,
};
export const pbScrim: CSSProperties = { background: PB.scrim, backdropFilter: v.scrimBlur, WebkitBackdropFilter: v.scrimBlur };
/** List row (no blur). With a photo use padding 8 / minHeight 96 (PbRow does this). */
export const pbRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', minHeight: 60,
  padding: '12px 16px', background: v.tileFill, border: `1px solid ${PB.tileBd}`, boxShadow: PB.tileHi,
  borderRadius: v.rRow, color: PB.tx, fontFamily: PB.sans, textAlign: 'left', minWidth: 0,
};

// Type scale (layout-and-components.md §2).
export const pbPageTitle: CSSProperties = { fontFamily: PB.sora, fontWeight: 700, fontSize: 'var(--pb-title)', letterSpacing: -0.3, lineHeight: 1.2, color: PB.tx, margin: 0, minWidth: 0, overflowWrap: 'anywhere' };
export const pbTileTitle: CSSProperties = { fontFamily: PB.sora, fontWeight: 700, fontSize: 17, letterSpacing: -0.3, lineHeight: 1.3, color: PB.tx, margin: 0 };
// Line-height 1.5 everywhere text may hold Hindi (DESIGN.md §3): names, buttons, chips, status labels.
export const pbName: CSSProperties = { fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: PB.tx };
export const pbBody: CSSProperties = { fontSize: 13, lineHeight: 1.5, color: PB.tx };
export const pbMeta: CSSProperties = { fontSize: 12, lineHeight: 1.5, color: PB.tx2 };
export const pbNum: CSSProperties = { fontFamily: PB.mono, fontVariantNumeric: 'tabular-nums' };
/** Inline error box (field / tile level). */
export const pbErrorBox: CSSProperties = { background: PB.failedBg, border: `1px solid ${PB.failedBd}`, borderRadius: PB.r.input, padding: '8px 12px', fontSize: 13, lineHeight: 1.5, color: PB.tx };

/** Inline style for the Playbook root: feeds the glow / lift / focus variables. */
export const pbRootVars = {
  '--glowA': PB.glowAmber, '--glowC': PB.glowCoral, '--glowI': PB.glowIndigo,
  '--pb-lift': PB.lift, '--pb-focus': PB.focus,
} as CSSProperties;
