// Product Detail Generator: the composer that turns the model's pieces into
// the owner's WhatsApp format. The code, the price, the HD-images link and
// the two footer links are placed HERE, by code — the model only ever writes
// the words. Pure (no React, no Supabase), so a harness checks the exact text.

export interface DetailSection { emoji: string; name: string; lines: string[] }
export interface Detail { title: string; titleEmoji: string; intro: string; sections: DetailSection[]; setIncludes: string[]; highlights: string[] }
export interface DetailResult {
  ok: boolean; error?: string; details?: string; code: string; detail: Detail;
  price: number | null; hdLink: string; folder: string;
  images: { name: string; b64: string }[];
  sheet: { tab: string; title: string; category: string; color: string; includes: string } | null;
  warnings: string[]; model: string; estUsd: number;
}

// Fixed footer, exactly as the owner's example (same values every time).
export const FOOTER_LINKS = {
  master: 'https://dailyoffice.aryadesigns.co.in/?utm_source=chatgpt.com#/s/RW5Un',
  ratelist: 'https://dailyoffice.aryadesigns.co.in/#/s/ratecard',
};
const RULE = '━━━━━━━━━━━━━━━━━━';

export const inr = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** The finished WhatsApp message. `price` null → "₹—" (the operator fills
 *  it in); an empty link leaves a visible placeholder rather than nothing. */
export function composeDetail(d: Detail, code: string, price: number | null, hdLink: string): string {
  const e = d.titleEmoji || '✨';
  const parts: string[] = [
    `✨${e} *${d.title}* ${e}✨`,
    '',
    `*Code: ${code}*`,
    '',
    `💫 ${d.intro}`.trim(),
    '',
    RULE,
  ];
  for (const sec of d.sections) {
    parts.push('', `${sec.emoji} *${sec.name}*`, ...sec.lines.map(l => `- ${l}`));
  }
  if (d.sections.length) parts.push('', RULE);
  if (d.setIncludes.length) parts.push('', '🎁 *Set Includes*', ...d.setIncludes.map(l => `- ${l}`), '', RULE);
  if (d.highlights.length) parts.push('', '🌟 *Highlights*', ...d.highlights.map(l => `- ${l}`), '', RULE);
  parts.push(
    '',
    `💰 *Price:* ₹${price != null && price > 0 ? inr(price) : '—'} + GST + Shipping`,
    '',
    '📸 *HD Images:*',
    hdLink || '(add the Dropbox link)',
    '',
    RULE,
    '',
    '*MASTER STOCK SHEET:*',
    FOOTER_LINKS.master,
    '',
    RULE,
    '',
    '*Ratelist Maker:*',
    FOOTER_LINKS.ratelist,
  );
  return parts.join('\n');
}
