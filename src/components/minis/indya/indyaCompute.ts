// Indya Import — the aggregation, pure. Odette's arithmetic per key
// (absent or NA → n/a; 'out of stock' or ≤ 0 → oos; else add; then
// + virtual − blocked), computed ONCE per distinct key list and mirrored
// to every Indya row that resolves to the same key (Indya lists one product
// under two or three of its own SKUs and already shows identical stock on
// each — owner's call to keep that).
//
// Lookup per vendor file: the strict key first, then the SHAPE key (dashes
// unreliable on both sides; see indyaSku.ts) — a shape hit is shown as a
// "loose match". Virtual Stock and Blocked use the same two lookups so
// stock, virtual and blocked always come from the same identity.
//
// What goes into the Stock cell (owner's rules):
//   unknown code   — the design code is in no vendor file at all → "SKU mismatch"
//   size missing   — the code is known somewhere, this size is not → 0
//   out of stock   — every file says 0 / out of stock → 0
//   blocked        — blocked wipes the balance → 0
//   above XXL      — vendors do not make it → 0, no lookup at all (owner)
//   otherwise      — max(0, total + virtual − blocked); virtual alone can
//                    stock a row no vendor lists (Odette parity)
import { lookupKeys, baseOf, normKey, shapeKey, isNoSize, isAboveXXL } from './indyaSku';
import type { MasterRow } from './indyaMaster';
import type { VendorFile, Corrections } from './indyaFiles';

export type Flag = 'ok' | 'last' | 'oos' | 'unknown' | 'size_missing' | 'blocked' | 'oversize';
export interface ResultRow {
  i: number; sku: string; vendorSku: string; size: string; oldStock: string;
  key: string; hitKey: string | null; stripped: boolean; viaShape: boolean; unstitched: boolean; corrected: string | null;
  siblings: number; total: number; vendorCount: number; naCount: number; oosCount: number;
  virtual: number; blocked: number; final: number; flag: Flag; out: string;
}
export interface Counts { total: number; ok: number; last: number; oos: number; unknown: number; size_missing: number; blocked: number; oversize: number; unstitched: number; shared: number; stripped: number; viaShape: number; corrected: number }
export interface ComputeResult { rows: ResultRow[]; counts: Counts; unknownBases: { base: string; rows: number }[]; stocks: string[] }

export const MISMATCH = 'SKU mismatch';

interface VendorIndex { strict: Map<string, string>; shape: Map<string, string>; bases: Set<string> }

function indexVendor(v: VendorFile): VendorIndex {
  const strict = new Map<string, string>(), shape = new Map<string, string>(), bases = new Set<string>();
  for (const r of v.rows) {
    const k = normKey(r.sku);
    strict.set(k, r.qty); shape.set(shapeKey(k), r.qty);        // last duplicate wins (Odette parity)
    bases.add(shapeKey(baseOf(k))); bases.add(shapeKey(k));
  }
  return { strict, shape, bases };
}

/** Numbers keyed both ways so a dashless spelling still finds its entry. */
function twoWay(map: Record<string, number>) {
  const strict = new Map<string, number>(), shape = new Map<string, number>();
  for (const [k, v] of Object.entries(map)) { const n = Number(v) || 0; strict.set(normKey(k), n); shape.set(shapeKey(k), n); }
  return { strict, shape };
}
const pickNum = (keys: string[], m: { strict: Map<string, number>; shape: Map<string, number> }): number => {
  for (const k of keys) { const v = m.strict.get(k); if (v) return v; }
  for (const k of keys) { const v = m.shape.get(shapeKey(k)); if (v) return v; }
  return 0;
};

const isNA = (q: string) => q.trim() === '' || q.trim().toUpperCase() === 'NA' || q.trim().toUpperCase() === 'N/A';
const isOos = (q: string) => /out[\s_-]*of[\s_-]*stock/i.test(q);

/** The code we look up for a row: the correction sheet wins (by Indya SKU,
 *  then by VendorSKU), else Indya's VendorSKU as given. */
const codeFor = (r: MasterRow, c?: Corrections | null): { code: string; corrected: string | null } => {
  const hit = c ? (c.bySku.get(normKey(r.sku)) ?? c.byVendor.get(normKey(r.vendorSku)) ?? null) : null;
  return hit ? { code: hit, corrected: hit } : { code: r.vendorSku, corrected: null };
};

type Shared = Omit<ResultRow, 'i' | 'sku' | 'vendorSku' | 'size' | 'oldStock' | 'siblings' | 'unstitched' | 'corrected' | 'stripped'>;

export function computeIndya(master: MasterRow[], vendors: VendorFile[], virtual: Record<string, number>, blocked: Record<string, number>, corrections?: Corrections | null): ComputeResult {
  const idx = vendors.map(indexVendor);
  const vmap = twoWay(virtual), bmap = twoWay(blocked);
  const codes = master.map(r => codeFor(r, corrections));
  const masterKeys = master.map((r, i) => lookupKeys(codes[i].code, r.size));

  // One computation per distinct key list (identical lists give identical
  // results). Siblings are counted afterwards on the key that resolved.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < master.length; i++) { const k = masterKeys[i].join('|'); const g = groups.get(k) || []; g.push(i); groups.set(k, g); }
  const byGroup = new Map<string, Shared>();

  for (const [gk, members] of groups) {
    const keys = masterKeys[members[0]];
    const raw = normKey(codes[members[0]].code);
    if (isAboveXXL(master[members[0]].size)) {
      byGroup.set(gk, { key: keys[keys.length - 1], hitKey: null, viaShape: false, total: 0, vendorCount: 0, naCount: 0, oosCount: 0, virtual: 0, blocked: 0, final: 0, flag: 'oversize', out: '0' });
      continue;
    }
    const baseShapes = new Set([shapeKey(raw), shapeKey(baseOf(raw, master[members[0]].size)), ...keys.map(shapeKey)]);
    let total = 0, vendorCount = 0, naCount = 0, oosCount = 0, hitKey: string | null = null, viaShape = false, known = false;
    for (const vi of idx) {
      if ([...baseShapes].some(s => vi.bases.has(s))) known = true;
      let qty: string | undefined, hk: string | null = null, loose = false;
      for (const k of keys) { if (vi.strict.has(k)) { qty = vi.strict.get(k); hk = k; break; } }
      if (qty === undefined) for (const k of keys) { const q = vi.shape.get(shapeKey(k)); if (q !== undefined) { qty = q; hk = k; loose = true; break; } }
      if (qty === undefined || isNA(qty)) { naCount++; continue; }
      if (!hitKey) { hitKey = hk; viaShape = loose; }
      if (isOos(qty)) { oosCount++; vendorCount++; continue; }
      const n = Number(qty.replace(/,/g, ''));
      if (!Number.isFinite(n) || n <= 0) { oosCount++; vendorCount++; continue; }
      total += n; vendorCount++;
    }
    const virt = pickNum(keys, vmap), blk = pickNum(keys, bmap);
    const final = total + virt - blk;
    let flag: Flag, out: string;
    if (idx.length > 0 && naCount === idx.length && virt <= 0) {
      if (!known) { flag = 'unknown'; out = MISMATCH; } else { flag = 'size_missing'; out = '0'; }
    } else if (blk > 0 && final <= 0) { flag = 'blocked'; out = '0'; }
    else if (total === 0 && oosCount > 0 && virt === 0) { flag = 'oos'; out = '0'; }
    else { flag = final === 1 ? 'last' : 'ok'; out = String(Math.max(0, final)); }
    byGroup.set(gk, { key: hitKey ?? keys[keys.length - 1], hitKey, viaShape, total, vendorCount, naCount, oosCount, virtual: virt, blocked: blk, final, flag, out });
  }
  const effCount = new Map<string, number>();
  for (const [gk, members] of groups) { const e = shapeKey(byGroup.get(gk)!.key); effCount.set(e, (effCount.get(e) || 0) + members.length); }

  const rows: ResultRow[] = master.map((r, i) => {
    const g = byGroup.get(masterKeys[i].join('|'))!;
    const code = normKey(codes[i].code);
    return { i, sku: r.sku, vendorSku: r.vendorSku, size: r.size, oldStock: r.stock, ...g, siblings: effCount.get(shapeKey(g.key)) || 1, unstitched: isNoSize(r.size), corrected: codes[i].corrected, stripped: baseOf(code, r.size) !== code };
  });
  const counts: Counts = { total: rows.length, ok: 0, last: 0, oos: 0, unknown: 0, size_missing: 0, blocked: 0, oversize: 0, unstitched: 0, shared: 0, stripped: 0, viaShape: 0, corrected: 0 };
  const unknownMap = new Map<string, number>();
  for (const r of rows) {
    counts[r.flag]++;
    if (r.unstitched) counts.unstitched++;
    if (r.siblings > 1) counts.shared++;
    if (r.stripped) counts.stripped++;
    if (r.viaShape) counts.viaShape++;
    if (r.corrected) counts.corrected++;
    if (r.flag === 'unknown') { const b = baseOf(codes[r.i].code, r.size); unknownMap.set(b, (unknownMap.get(b) || 0) + 1); }
  }
  const unknownBases = [...unknownMap.entries()].map(([base, n]) => ({ base, rows: n })).sort((a, b) => b.rows - a.rows || a.base.localeCompare(b.base));
  return { rows, counts, unknownBases, stocks: rows.map(r => r.out) };
}
