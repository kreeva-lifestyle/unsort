// Sending a listing's custom fields (Shopify metafields; fields.ts builds them) after its productSet (publish.ts).
// A store that already had a field of its own keeps it, and gets the value in that field's kind (owner, 2026-11-17:
// "if already made then merge with it"): SuratMandi's Work and Occasion were one line of text before Playbook's store
// setup, so "Embroidery, Mirror Work" goes in as one line, not as a list. The store's field kinds are read first (once
// per store every 10 minutes), so the fields go in on the first try.
// metafieldsSet saves all or nothing. A field refused for its kind (INVALID_TYPE: the store's field changed meanwhile)
// is sent once more in the other kind — Playbook's own when it had been converted, else the other text kind; a field
// refused for anything else (a value outside the store's choices, too long…) is the store's rule, left out with
// Shopify's reason. Either way the other fields still go in. Shopify names the refused field by its place in `field`
// (["metafields", "2", "type"]); `elementIndex` is the place of an item INSIDE a list value, not which field —
// reading it as the field's place sent nothing again, and left all 122 SuratMandi products without any custom field
// (18 Nov 2026).
// A field Playbook filled before whose value went empty is taken off the product: dropFields (20 Nov 2026).
import { FIELD_NS, METAFIELDS_SET, type FieldInput } from './fields.ts';
import { plain } from './http.ts';
import { temporary } from './publishParts.ts';
import { gql } from './shopify.ts';
import { LIST, TEXT } from './storeFields.ts';
import type { WebsiteRow } from './types.ts';

const NO_FIELDS = 'Saved on Shopify, but its custom fields (fabric, work, FAQ…) were not';
const MULTI = 'multi_line_text_field';
const KINDS = `query PbFieldKinds { metafieldDefinitions(first: 250, ownerType: PRODUCT, namespace: "custom") { nodes { key type { name } } } }`;
const KINDS_FOR_MS = 10 * 60_000;
interface FieldError { message: string; code?: string | null; field?: string[] | null }

const valuesOf = (f: FieldInput): string[] => {
  if (f.type !== LIST) return [f.value];
  try { const v: unknown = JSON.parse(f.value); return (Array.isArray(v) ? v : []).map(x => String(x ?? '').trim()).filter(Boolean); } catch { return []; }
};

/** The same value in another text kind: a list as one comma-joined line ("Embroidery, Sequins", also into a multi-line
 *  text field), one line as a list of one. null when the value cannot go in that kind (a number, a reference…): the
 *  field is left out. */
export function inKind(f: FieldInput, kind: string): FieldInput | null {
  if (kind === f.type) return f;
  if (f.type !== TEXT && f.type !== LIST) return null;
  const vals = valuesOf(f);
  if (!vals.length) return null;
  if (kind === TEXT) return { ...f, type: TEXT, value: vals.join(', ').slice(0, 255) };
  if (kind === LIST) return { ...f, type: LIST, value: JSON.stringify(vals) };
  if (kind === MULTI) return { ...f, type: MULTI, value: vals.join(', ') };
  return null;
}

/** The other text kind, when the store's kind is not known (a refusal): list ↔ one line. */
export const otherForm = (f: FieldInput): FieldInput | null => (f.type === LIST ? inKind(f, TEXT) : f.type === TEXT ? inKind(f, LIST) : null);

const kinds = new Map<string, { at: number; byKey: Map<string, string> }>();
/** One store: the website, and the shop it points at now (a store move keeps the website's id). */
const storeOf = (site: WebsiteRow) => `${site.id}|${String(site.shop_domain || '').trim().toLowerCase()}`;

/** The store's own product fields in `custom`: key → kind. null when they cannot be read (the refusals then tell). */
async function storeKinds(site: WebsiteRow, ms: number): Promise<Map<string, string> | null> {
  const hit = kinds.get(storeOf(site));
  if (hit && Date.now() - hit.at < KINDS_FOR_MS) return hit.byKey;
  try {
    const r = await gql<{ metafieldDefinitions: { nodes: { key: string; type: { name: string } }[] } }>(site, KINDS, {}, ms);
    const byKey = new Map(r.metafieldDefinitions.nodes.map(n => [n.key, n.type.name]));
    kinds.set(storeOf(site), { at: Date.now(), byKey });
    return byKey;
  } catch (e) {
    if (temporary(e)) throw e;
    kinds.set(storeOf(site), { at: Date.now(), byKey: new Map() }); // not asked again for every product: the refusals tell
    return null;
  }
}

/** The refused field's place in the list sent (["metafields", "2", …] → 2). */
const placeOf = (e: FieldError) => { const f = e.field ?? [], i = f[0] === 'metafields' ? Number(f[1]) : NaN; return Number.isInteger(i) ? i : null; };
const wrongKind = (e: FieldError) => e.code === 'INVALID_TYPE' || /consistent with the definition/i.test(e.message);

/** The listing's custom fields. Returns a warning for the listing, or null when all went in. */
export async function sendFields(site: WebsiteRow, fields: FieldInput[], ms: number): Promise<string | null> {
  if (!fields.length) return null;
  const set = async (list: FieldInput[]) => (await gql<{ metafieldsSet: { userErrors: FieldError[] } | null }>(site, METAFIELDS_SET, { metafields: list }, ms)).metafieldsSet?.userErrors || [];
  const said = (ue: FieldError[]) => [...new Set(ue.map(e => e.message))].join('; ');
  try {
    const byKey = await storeKinds(site, ms);
    // Each field in the store's kind; a store field no text goes in is the store's own, left as it is.
    const left: string[] = [], why: string[] = [];
    let list: { src: FieldInput; out: FieldInput }[] = [];
    for (const f of fields) {
      const k = byKey?.get(f.key), out = k ? inKind(f, k) : f;
      if (out) list.push({ src: f, out });
      else { left.push(f.key); why.push(`its own ${f.key} field is ${String(k).replace(/_/g, ' ')}`); }
    }
    for (let round = 0; list.length && round <= fields.length; round++) {
      const ue = await set(list.map(x => x.out));
      if (!ue.length) break;
      const at = new Map<number, FieldError[]>();
      for (const e of ue) { const i = placeOf(e); if (i !== null) at.set(i, [...(at.get(i) ?? []), e]); }
      if (!at.size) return `${NO_FIELDS}: ${said(ue).slice(0, 200)}`; // not told which: nothing went in
      if (ue.some(wrongKind)) kinds.delete(storeOf(site)); // the store's kinds changed meanwhile: read again next time
      const next: typeof list = [];
      list.forEach((x, i) => {
        const errs = at.get(i);
        if (!errs) { next.push(x); return; }
        const alt = round === 0 && errs.every(wrongKind) ? (x.out !== x.src ? x.src : otherForm(x.src)) : null;
        if (alt) next.push({ src: x.src, out: alt });
        else { left.push(x.src.key); why.push(said(errs)); }
      });
      list = next;
    }
    return left.length ? `Saved on Shopify, but the store did not take these custom fields: ${left.join(', ')} (${[...new Set(why)].join('; ').slice(0, 200)}).` : null;
  } catch (e) {
    if (temporary(e)) throw e;
    return `${NO_FIELDS}: ${plain(e)}`;
  }
}

const FIELDS_DROP = `mutation PbFieldsDrop($metafields: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } } }`;

/** Take Playbook's own fields off a product whose value went empty in Playbook (listingFacts.ts `emptied`: only keys
 *  Playbook is on record as having filled), so a value removed there does not live on at the store (owner, 20 Nov 2026:
 *  "Corrected tags and fields"). A field already gone is fine. Returns a warning for the listing, or null. */
export async function dropFields(site: WebsiteRow, ownerId: string, keys: string[], ms: number): Promise<string | null> {
  if (!keys.length) return null;
  try {
    const r = await gql<{ metafieldsDelete: { userErrors: FieldError[] } | null }>(site, FIELDS_DROP, { metafields: keys.map(key => ({ ownerId, namespace: FIELD_NS, key })) }, ms);
    const ue = r.metafieldsDelete?.userErrors || [];
    return ue.length ? `Saved on Shopify, but these emptied custom fields stayed there: ${keys.join(', ')} (${[...new Set(ue.map(e => e.message))].join('; ').slice(0, 200)}).` : null;
  } catch (e) {
    if (temporary(e)) throw e;
    return `Saved on Shopify, but these emptied custom fields stayed there: ${keys.join(', ')} (${plain(e).slice(0, 200)}).`;
  }
}
