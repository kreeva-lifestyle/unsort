// The writer's instructions and JSON schema (step 3, one call per listing).
import type { ContentCfg, ProductRow } from './types.ts';

export interface GenOut {
  title: string; description_html: string; seo_title: string; seo_description: string;
  handle: string; extra_tags: string[]; image_alts: string[];
}

export const genSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' }, description_html: { type: 'string' },
    seo_title: { type: 'string' }, seo_description: { type: 'string' }, handle: { type: 'string' },
    extra_tags: { type: 'array', items: { type: 'string' } },
    image_alts: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'description_html', 'seo_title', 'seo_description', 'handle', 'extra_tags', 'image_alts'],
  additionalProperties: false,
};

const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);

export function genSystem(siteName: string, c: Partial<ContentCfg>, extraMax: number, photos: number): string {
  return [
    `You write Shopify product listings for "${siteName}", an online store for Indian ethnic wear.`,
    `Write in ${String(c.language || 'English').slice(0, 40)}. Brand voice: ${String(c.brand_voice || '').trim().slice(0, 600) || 'clear, warm and trustworthy'}.`,
    'Use ONLY the facts given. Never invent fabric, sizes, measurements, work, care or set contents that are not listed. No prices, discounts, phone numbers, supplier names, emojis or ALL CAPS.',
    'The vendor\'s original post is context only: ignore any prices, contact details or wholesale terms in it.',
    `title: a natural product title for shoppers, at most ${n(c.title_max, 70)} characters.`,
    `description_html: about ${n(c.description_words, 120)} words, using only <p>, <ul>, <li>, <strong>, <em> and <br> tags (no headings, links, classes or styles). A short opening paragraph, then a bullet list of the key facts.`,
    `seo_title: at most ${n(c.meta_title_max, 60)} characters. seo_description: at most ${n(c.meta_desc_max, 155)} characters, one or two sentences with the words shoppers search for.`,
    'handle: a short URL slug (lowercase a-z, 0-9 and hyphens).',
    extraMax > 0 ? `extra_tags: up to ${extraMax} short style / occasion tags shoppers would filter by (e.g. "Festive", "Wedding Guest"); [] if none fit.` : 'extra_tags: [].',
    c.alt_text !== false && photos > 0 ? `image_alts: exactly ${photos} short alt texts, one per photo in the order given, describing what each photo shows.` : 'image_alts: [].',
    ...(String(c.extra_instructions || '').trim() ? [`Extra instructions from the store owner: ${String(c.extra_instructions).trim().slice(0, 2000)}`] : []),
  ].join('\n');
}

export function genFacts(p: ProductRow, vendor: string): string {
  const attrs = Object.entries(p.attributes || {}).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`);
  return [
    'Product facts:',
    p.name && `- name: ${p.name}`, p.category && `- category: ${p.category}`, p.fabric && `- fabric: ${p.fabric}`,
    p.color && `- color: ${p.color}`, p.sizes?.length ? `- sizes: ${p.sizes.join(', ')}` : '- sizes: not given (do not mention sizes)',
    p.sku && `- design code: ${p.sku}`, vendor && `- supplier (do not mention unless the extra instructions ask): ${vendor}`,
    ...attrs,
    p.raw_text ? `\nVendor's original post (context only):\n${String(p.raw_text).slice(0, 3000)}` : '',
  ].filter(Boolean).join('\n');
}
