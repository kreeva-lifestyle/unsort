// --- sku_thumbs (7 cols) ---
// One row per SKU: whether its Dropbox photo has a stored 256px thumbnail
// (public sku-thumbs bucket, <SKU>.jpg) and the version used as the URL
// cache-buster. Written only by the sku-thumbs edge function (service role);
// read by src/lib/skuThumbs.ts. Re-exported from database.ts.
export type SkuThumbStatus = 'ok' | 'missing';
export interface SkuThumbRow {
  sku: string;
  status: SkuThumbStatus;
  dropbox_path: string | null;
  version: number;
  checked_at: string;
  created_at: string;
  updated_at: string;
}
