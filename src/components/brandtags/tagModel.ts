// Brand Tags: the label as the screens use it, plus the small helpers the page
// and its parts share. Moved out of pages/BrandTags.tsx.
import type { BrandTag } from '../../types/database';

// UI view model: central BrandTag fields renamed for camelCase ergonomics
// (jio_code -> jioCode). Omits server-managed columns the UI doesn't need.
export interface BrandTagRow {
  id: string;
  brand: string;
  ean: string;
  sku: string;
  qty: string;
  mrp: number;
  size: string;
  product: string;
  color: string;
  mktd: string;
  jioCode: string;
  copies: number;
}

/** The columns every read asks for — spelled out, never select('*'). */
export const TAG_COLUMNS = 'id, brand, ean, sku, qty, mrp, size, product, color, mktd, jio_code, copies';
export type BrandTagDb = Pick<BrandTag, 'id' | 'brand' | 'ean' | 'sku' | 'qty' | 'mrp' | 'size' | 'product' | 'color' | 'mktd' | 'jio_code' | 'copies'>;

export const toRow = (d: BrandTagDb): BrandTagRow => ({
  id: d.id, brand: d.brand, ean: d.ean, sku: d.sku, qty: d.qty, mrp: Number(d.mrp), size: d.size,
  product: d.product, color: d.color, mktd: d.mktd, jioCode: d.jio_code, copies: d.copies,
});

export const uid = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const sampleRow = (): BrandTagRow => ({
  id: uid(), brand: 'BRAND NAME: TANUKA', ean: '8905738880431', sku: 'TNDRS177-S',
  qty: 'INCLUDES: 1 U Top, 1 U Bottom, 1 U Dupatta', mrp: 6800, size: 'S',
  product: 'PRODUCT DESC: Co-ord Set', color: 'Pink',
  mktd: 'Arya Designs, 16, Amba Bhuvan, Nr. Kasanagar Circle, Opp. Kumar Gurukul Vidhyalaya Katargam, Surat-395004',
  jioCode: '702342013006', copies: 0,
});

export const DEFAULT_MKTD = 'Arya Designs, 16, Amba Bhuvan, Near Kasanagar Circle, Opp- Kumar Gurukul Vidhyalay Katargam, Surat-395004, Gujarat, India';
export const blankRow = (): BrandTagRow => ({
  id: uid(), brand: '', ean: '', sku: '', qty: '', mrp: 0,
  size: '', product: '', color: '', mktd: DEFAULT_MKTD, jioCode: '', copies: 0,
});

const REQUIRED_FIELDS: (keyof BrandTagRow)[] = ['brand', 'ean', 'sku', 'qty', 'size', 'product', 'color', 'mktd', 'jioCode'];
/** The first missing field of a label, or null when it is complete. */
export const validateRow = (r: BrandTagRow): string | null => {
  for (const f of REQUIRED_FIELDS) { if (!r[f] || String(r[f]).trim() === '') return f; }
  if (!r.mrp || r.mrp <= 0) return 'mrp';
  return null;
};

export const fmtMrp = (v: number): string => '₹' + v.toLocaleString('en-IN');

/** Order-sheet / import "Marketplace" column → the brand printed on the label. */
export const MARKETPLACE_BRAND: Record<string, string> = { 'ajio b2c': 'FUSIONIC', 'ajio tanuka': 'TANUKA', 'ajio svaraa': 'SVARAA' };
