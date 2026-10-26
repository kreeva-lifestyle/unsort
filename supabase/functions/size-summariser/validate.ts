// Size Summariser — the tool schema the model fills and the deterministic
// checks run on its answer (order number, no customer details, every value
// really on its page, required fields, numeric sanity). Pure functions over
// the pages the app sent; index.ts owns auth, settings, the model call and
// storage.

// deno-lint-ignore-file no-explicit-any
export interface Page { n: number; text: string; image?: string }
export interface Settings {
  model: string; effort: string; prompt: string; prompt_version: number; order_no_regex: string;
  measurement_min: number; measurement_max: number; required_fields: Record<string, string[]>;
  sheet_title: string; footer_text: string; raster_only_option_pages: boolean;
}

export const SCHEMA = {
  type: 'object',
  required: ['order', 'measurements', 'choices', 'notes', 'warnings', 'excluded_pii_detected'],
  properties: {
    order: {
      type: 'object', required: ['order_no', 'product_name', 'garment_type', 'stitching_tier'],
      properties: {
        order_no: { type: 'string' }, product_name: { type: 'string' },
        garment_type: { type: 'string', enum: ['saree_blouse', 'lehenga', 'suit', 'gown', 'other'] },
        stitching_tier: { type: 'string', description: 'e.g. standard | designer | plus_size | none; as written on the form' },
        stitching_tier_hi: { type: 'string' }, form_title: { type: 'string' },
      },
    },
    measurements: {
      type: 'array',
      items: {
        type: 'object', required: ['key', 'label_en', 'label_hi', 'value', 'unit', 'page', 'confidence'],
        properties: {
          key: { type: 'string', description: 'snake_case: bust, under_bust, shoulder, arm_hole, front_neck_depth, back_neck_depth, blouse_length, sleeve_length, sleeve_round, waist, hip, lehenga_length, kurta_length, bottom_length, bottom_round …' },
          label_en: { type: 'string' }, label_hi: { type: 'string' },
          hint_hi: { type: 'string', description: '<= 8 words, where it is measured' },
          value: { type: ['number', 'null'] }, unit: { type: 'string', enum: ['inch', 'cm', 'unknown'] },
          section: { type: 'string', enum: ['upper', 'lower', 'other'] },
          page: { type: 'integer' }, confidence: { type: 'string', enum: ['high', 'low'] },
        },
      },
    },
    choices: {
      type: 'array',
      items: {
        type: 'object', required: ['key', 'label_hi', 'value_en', 'value_hi', 'page', 'confidence', 'answered'],
        properties: {
          key: { type: 'string' }, label_hi: { type: 'string' }, value_en: { type: 'string' }, value_hi: { type: 'string' },
          answered: { type: 'boolean' }, page: { type: 'integer' }, confidence: { type: 'string', enum: ['high', 'low'] },
        },
      },
    },
    notes: { type: 'array', items: { type: 'object', required: ['text_original', 'text_hi', 'page'], properties: { text_original: { type: 'string' }, text_hi: { type: 'string' }, page: { type: 'integer' } } } },
    warnings: { type: 'array', items: { type: 'object', required: ['severity', 'text_hi'], properties: { severity: { type: 'string', enum: ['info', 'check', 'blocker'] }, text_hi: { type: 'string' }, text_en: { type: 'string' } } } },
    excluded_pii_detected: { type: 'boolean' },
  },
};


// ── Deterministic checks (code, not the model) ───────────────────────────────
const normText = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const numText = (v: number) => (Number.isInteger(v) ? String(v) : String(v).replace(/0+$/, ''));

/** Customer-detail values the form itself tells us: the answers on pages whose question is a name / phone / email / address. */
export function piiValues(pages: Page[]): string[] {
  const out: string[] = [];
  for (const p of pages) {
    const lines = (p.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const q = lines[0];
    if (!/\b(name|phone|mobile|whatsapp|contact|e-?mail|address|city|pincode|pin code|country|state)\b/i.test(q)) continue;
    for (const l of lines.slice(1)) if (l.length >= 3 && !/^\*|^\(|required/i.test(l)) out.push(l);
  }
  return out;
}

export function validate(data: any, pages: Page[], s: Settings, piiList: string[]): { data: any; pii: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data?.order || !Array.isArray(data.measurements) || !Array.isArray(data.choices)) return { data, pii: false, errors: ['missing order / measurements / choices'] };
  data.notes = Array.isArray(data.notes) ? data.notes : [];
  data.warnings = Array.isArray(data.warnings) ? data.warnings : [];
  const texts = new Map(pages.map(p => [p.n, p.text || '']));

  // Order number: the model's, or the first match on page 1.
  let re: RegExp | null = null;
  try { re = new RegExp(s.order_no_regex); } catch { /* bad setting: skip */ }
  if (re && !re.test(String(data.order.order_no || ''))) {
    const loose = new RegExp(s.order_no_regex.replace(/^\^/, '').replace(/\$$/, ''));
    const hit = (texts.get(1) || '').match(loose) || [...texts.values()].join('\n').match(loose);
    if (hit) data.order.order_no = hit[0]; else errors.push(`order number "${data.order.order_no}" does not look like an order number`);
  }

  // Customer details: anything from the form's own name/phone/email answers, plus email / phone shapes, is stripped everywhere.
  const keep = new Set([String(data.order.order_no || '').toLowerCase()]);
  const patterns = [/[\w.+-]+@[\w-]+\.[\w.]+/g, /\+?91[\s-]?\d{5}[\s-]?\d{5}/g, /\b\d{10}\b/g];
  let pii = false;
  const scrub = (v: unknown): unknown => {
    if (typeof v === 'string') {
      let out = v;
      for (const pv of piiList) { const n = normText(pv); if (n.length >= 3 && !keep.has(n) && normText(out).includes(n)) { out = out.replace(new RegExp(pv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ''); pii = true; } }
      for (const re2 of patterns) if (re2.test(out)) { out = out.replace(re2, ''); pii = true; }
      return out.replace(/\s{2,}/g, ' ').trim();
    }
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') { const o: any = {}; for (const [k, x] of Object.entries(v)) o[k] = scrub(x); return o; }
    return v;
  };
  data = scrub(data);

  // Every number must really be on its page.
  for (const m of data.measurements) {
    if (m.value === null || m.value === undefined) continue;
    const t = texts.get(Number(m.page)) || '';
    if (!t.includes(numText(Number(m.value)))) { m.confidence = 'low'; data.warnings.push({ severity: 'check', text_hi: `${m.label_hi || m.key} ${numText(Number(m.value))}" पेज ${m.page} के टेक्स्ट में नहीं मिला — जाँचें`, text_en: `${m.key} ${m.value} not found in the text of page ${m.page}` }); }
  }
  // Required fields for this garment.
  const present = new Set(data.measurements.filter((m: any) => m.value !== null && m.value !== undefined).map((m: any) => m.key));
  for (const k of s.required_fields[data.order.garment_type] || []) {
    if (!present.has(k)) data.warnings.push({ severity: 'blocker', text_hi: `ज़रूरी माप नहीं मिला: ${k.replace(/_/g, ' ')} — ग्राहक से पूछें`, text_en: `required measurement missing: ${k}` });
  }
  // Numeric sanity.
  const val = (k: string) => data.measurements.find((m: any) => m.key === k && m.value !== null)?.value;
  if (val('bust') !== undefined && val('under_bust') !== undefined && Number(val('bust')) < Number(val('under_bust'))) data.warnings.push({ severity: 'check', text_hi: `बस्ट (${val('bust')}") अंडर बस्ट (${val('under_bust')}") से कम है — ग्राहक से जाँचें`, text_en: 'bust below under-bust' });
  for (const m of data.measurements) {
    if (m.value === null || m.value === undefined) continue;
    if (Number(m.value) < s.measurement_min || Number(m.value) > s.measurement_max) data.warnings.push({ severity: 'check', text_hi: `${m.label_hi || m.key} ${numText(Number(m.value))}" सामान्य सीमा से बाहर है — जाँचें`, text_en: `${m.key} ${m.value} outside ${s.measurement_min}–${s.measurement_max}` });
  }
  // Dedupe warnings.
  const seen = new Set<string>();
  data.warnings = data.warnings.filter((w: any) => { const k = normText(String(w.text_hi || '')); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  return { data, pii: pii || !!data.excluded_pii_detected, errors };
}
