// Stitch Calculator (Minis) — the owner's rule (2026-11-15):
//   Stitch ÷ 1000 × Rate per stitch = amount
//   Meter wise: amount × the multiplier of the area chosen first = Cost per meter
//               (Area 250 → × 4 · 400 → × 2.5 · 600 → × 1.5)
//   Piece wise: amount = Cost per piece — "piece wise should not multiply by area"
// Pure, so the screen, its working line and the guide's examples agree.

export type StitchArea = 250 | 400 | 600;
export const AREAS: { area: StitchArea; factor: number }[] = [
  { area: 250, factor: 4 },
  { area: 400, factor: 2.5 },
  { area: 600, factor: 1.5 },
];

export type RateBasis = 'meter' | 'piece';
export const BASIS: { id: RateBasis; label: string; per: string }[] = [
  { id: 'meter', label: 'Meter wise', per: 'per meter' },
  { id: 'piece', label: 'Piece wise', per: 'per piece' },
];

/** A typed number: digits with at most one decimal point, never negative. Anything else → null. */
export function parseNum(raw: string): number | null {
  const t = raw.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** `factor`: the area's multiplier, null for piece wise (no area). */
export interface StitchResult { amount: number; factor: number | null; cost: number }

/** null until the stitch count and the rate are there — and, meter wise, the area. */
export function stitchCost(stitch: number | null, rate: number | null, area: StitchArea | null, basis: RateBasis = 'meter'): StitchResult | null {
  if (stitch == null || rate == null) return null;
  const amount = (stitch / 1000) * rate;
  if (basis === 'piece') return { amount, factor: null, cost: amount };
  const a = AREAS.find(x => x.area === area);
  return a ? { amount, factor: a.factor, cost: amount * a.factor } : null;
}

const round = (n: number, places: number) => { const f = 10 ** places; return Math.round((n + Number.EPSILON) * f) / f; };
const STEP = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });
const COST = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Working-line numbers: Indian grouping, up to 4 decimals (so each step multiplies out exactly as shown). */
export const fmtStep = (n: number) => STEP.format(round(n, 4));
/** The cost: Indian grouping, always 2 decimals. */
export const fmtCost = (n: number) => COST.format(round(n, 2));
