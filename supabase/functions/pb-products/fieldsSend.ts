// Sending a listing's custom fields (Shopify metafields; fields.ts builds them) after its productSet (publish.ts).
// A store that already had a field of its own keeps it, and gets the value in that field's kind (owner, 2026-11-17:
// "if already made then merge with it"): SuratMandi's Work and Occasion were one line of text before Playbook's store
// setup, so "Embroidery, Mirror Work" goes in as one line, not as a list. The store's field kinds are read first (once
// per store every 10 minutes), so the fields go in on the first try.
// metafieldsSet saves all or nothing. A field the store still refuses (its kind changed meanwhile) is sent again in its
// other text kind, then left out, so one refused field never costs the others. Shopify names the refused field by its
// place in `field` (["metafields", "2", "type"]); `elementIndex` is the place of an item INSIDE a list value, not
// which field — reading it as the field's place sent nothing again, and left all 122 SuratMandi products without any
// custom field (18 Nov 2026).
import { METAFIELDS_SET, type FieldInput } from './fields.ts';
import { plain } from './http.ts';
import { temporary } from './publishParts.ts';
import { gql } from './shopify.ts';
import { LIST, TEXT } from './storeFields.ts';
import type { WebsiteRow } from './types.ts';

const NO_FIELDS = 'Saved on Shopify, but its custom fields (fabric, work, FAQ…) were not';
const MULTI = 'multi_line_text_field';
const KINDS = `query PbFieldKinds { metafieldDefinitions(first: 250, ownerType: PRODUCT, namespace: "custom") { nodes { key type { name } } } }`;
const KINDS_FOR_MS = 10 * 60_000;
interface FieldError { message: string; field?: string[] | null }

const valuesOf = (f: FieldInput): string[] => {
  if (f.type !== LIST) return [f.value];
  try { const v: unknown = JSON.parse(f.value); return (Array.isArray(v) ? v : []).map(x => String(x ?? '').trim()).filter(Boolean); } catch { return []; }
};

/** The same value in another text kind: a list as one line ("Embroidery, Sequins") or as lines, one line as a list of
 *  one. null when the value cannot go in that kind (a number, a reference…): the field is left out. */
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

/** The store's own product fields in `custom`: key → kind. null when they cannot be read (the refusals then tell). */
async function storeKinds(site: WebsiteRow, ms: number): Promise<Map<string, string> | null> {
  const hit = kinds.get(site.id);
  if (hit && Date.now() - hit.at < KINDS_FOR_MS) return hit.byKey;
  try {
    const r = await gql<{ metafieldDefinitions: { nodes: { key: string; type: { name: string } }[] } }>(site, KINDS, {}, ms);
    const byKey = new Map(r.metafieldDefinitions.nodes.map(n => [n.key, n.type.name]));
    kinds.set(site.id, { at: Date.now(), byKey });
    return byKey;
  } catch (e) {
    if (temporary(e)) throw e;
    kinds.set(site.id, { at: Date.now(), byKey: new Map() }); // not asked again for every product: the refusals tell
    return null;
  }
}

/** The refused fields' places in the list sent (["metafields", "2", …] → 2). */
const placesOf = (ue: FieldError[]) => new Set(ue.flatMap(e => {
  const f = e.field ?? [], i = f[0] === 'metafields' ? Number(f[1]) : NaN;
  return Number.isInteger(i) ? [i] : [];
}));

/** The listing's custom fields. Returns a warning for the listing, or null when all went in. */
export async function sendFields(site: WebsiteRow, fields: FieldInput[], ms: number): Promise<string | null> {
  if (!fields.length) return null;
  const set = async (list: FieldInput[]) => (await gql<{ metafieldsSet: { userErrors: FieldError[] } | null }>(site, METAFIELDS_SET, { metafields: list }, ms)).metafieldsSet?.userErrors || [];
  const said = (ue: FieldError[]) => [...new Set(ue.map(e => e.message))].join('; ').slice(0, 200);
  const notTaken = (keys: string[], why: string) => `Saved on Shopify, but the store did not take these custom fields: ${keys.join(', ')} (${why}).`;
  try {
    const byKey = await storeKinds(site, ms);
    const fitted = fields.map(f => { const k = byKey?.get(f.key); return k ? inKind(f, k) : f; });
    const first = fitted.filter((f): f is FieldInput => !!f);
    // A store field of a kind no text goes in (a number, a reference…) is the store's own: left as it is.
    const unfit = fields.filter((_, i) => !fitted[i]).map(f => f.key);
    const unfitWhy = unfit.map(k => `its own ${k} field is ${String(byKey?.get(k) ?? '').replace(/_/g, ' ')}`).join('; ');
    const ue = first.length ? await set(first) : [];
    if (!ue.length) return unfit.length ? notTaken(unfit, unfitWhy) : null;
    kinds.delete(site.id); // the store's kinds changed meanwhile: read again next time
    const bad = placesOf(ue);
    if (!bad.size) return `${NO_FIELDS}: ${said(ue)}`;
    const again = first.map((f, i) => (bad.has(i) ? otherForm(f) : f)).filter((f): f is FieldInput => !!f);
    const dropped = [...unfit, ...first.filter((f, i) => bad.has(i) && !otherForm(f)).map(f => f.key)];
    const ue2 = again.length ? await set(again) : [];
    if (!ue2.length) return dropped.length ? notTaken(dropped, said(ue)) : null;
    const bad2 = placesOf(ue2);
    if (!bad2.size) return `${NO_FIELDS}: ${said(ue2)}`;
    const rest = again.filter((_, i) => !bad2.has(i)); // one refused field must not cost the others
    const ue3 = rest.length ? await set(rest) : [];
    if (ue3.length) return `${NO_FIELDS}: ${said(ue3)}`;
    return notTaken([...dropped, ...again.filter((_, i) => bad2.has(i)).map(f => f.key)], said(ue2));
  } catch (e) {
    if (temporary(e)) throw e;
    return `${NO_FIELDS}: ${plain(e)}`;
  }
}
