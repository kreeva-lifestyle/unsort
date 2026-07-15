// Parse the Listing AI SKU box: one product per line, optionally followed by
// the Dropbox link of that product's image folder. A bare SKU keeps the
// server-side auto-search (Link Generator folders). Quick pastes with many
// SKUs on one line still work — but a link on a line applies to every SKU on
// that same line, so "one per line" is the documented way when giving links.
export interface SkuLine { sku: string; link?: string }

export function parseSkuLines(text: string): SkuLine[] {
  const seen = new Set<string>();
  const out: SkuLine[] = [];
  for (const raw of text.split(/\n+/)) {
    const parts = raw.trim().split(/[\s,;]+/).filter(Boolean);
    if (parts.length === 0) continue;
    const link = parts.find(p => /^https?:\/\//i.test(p));
    for (const p of parts) {
      if (/^https?:\/\//i.test(p)) continue;
      const sku = p.toUpperCase();
      if (!sku || seen.has(sku)) continue;
      seen.add(sku);
      out.push(link ? { sku, link } : { sku });
    }
  }
  return out;
}
