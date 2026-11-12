// Did Shopify manage to process the photos? (pre-launch check, 2026-11-13, D5)
// productSet answers before Shopify has fetched and processed the pictures,
// so a photo it could not take (too large, damaged, an address it could not
// reach) left a "Published" listing with a hole in its gallery and nothing
// said so. A publish that uploads photos now clears media_checked_at; a few
// minutes later the worker looks at the product's media once:
//   every photo ready        → checked, nothing to say;
//   Shopify still working    → looked at again next run (for up to 30 minutes);
//   some failed, or still not ready after 30 minutes
//                            → noted on the listing (it stays Published, with
//                              the note, and shows under "Published with a
//                              note"); "Publish" sends the failed ones again
//                              (publishParts.ts filesFor).
// A store that cannot be asked is tried again each run and given up after a
// day, so one dead store cannot keep the worker awake for ever.
import { ago, enc, logActivity, nowIso, one, patch, sel } from './db.ts';
import { plain } from './http.ts';
import { gql } from './shopify.ts';
import { WEBSITE_COLS, type WebsiteRow } from './types.ts';

const WAIT_MS = 3 * 60_000, SLOW_MS = 30 * 60_000, GIVE_UP_MS = 24 * 3600_000;
const MEDIA = 'query PbMedia($id: ID!) { product(id: $id) { media(first: 250) { nodes { status } } } }';

/** 'ok', 'wait' (Shopify is still working on them, and it is early) or how many photos it could not process. */
export function mediaVerdict(nodes: { status?: string | null }[], publishedAt: string, now = Date.now()): 'ok' | 'wait' | number {
  const failed = nodes.filter(n => n.status === 'FAILED').length;
  const pending = nodes.filter(n => n.status === 'UPLOADED' || n.status === 'PROCESSING').length;
  const slow = now - Date.parse(publishedAt) > SLOW_MS;
  if (!failed && pending && !slow) return 'wait';
  return failed + (slow ? pending : 0) || 'ok';
}

export const photoNote = (bad: number, of: number) =>
  `Shopify could not process ${bad} of this product's ${of} photo${of === 1 ? '' : 's'}, so the store shows it without ${bad === 1 ? 'it' : 'them'}. A very large or damaged file is the usual reason: check the photos, then tap Publish to send ${bad === 1 ? 'it' : 'them'} again.`;

interface Row { id: string; product_id: string; website_id: string; shopify_product_id: string; published_at: string | null; error: string | null }

/** Look at up to `limit` freshly published listings. Returns how many were settled. */
export async function checkMedia(limit: number, inTime: () => boolean): Promise<number> {
  const rows = await sel<Row>(`pb_listings?status=eq.published&media_checked_at=is.null&shopify_product_id=not.is.null&published_at=lt.${ago(WAIT_MS)}&select=id,product_id,website_id,shopify_product_id,published_at,error&order=published_at.asc&limit=${limit}`);
  const sites = new Map<string, WebsiteRow | null>(), down = new Set<string>(); // down: a store that just failed is asked once a run
  let n = 0;
  for (const l of rows) {
    if (!inTime()) break;
    if (down.has(l.website_id)) continue;
    const mine = `id=eq.${enc(l.id)}&status=eq.published&media_checked_at=is.null`;
    const settle = (extra: Record<string, unknown> = {}) => patch('pb_listings', mine, { media_checked_at: nowIso(), ...extra });
    const at = l.published_at || nowIso();
    try {
      if (!sites.has(l.website_id)) sites.set(l.website_id, await one<WebsiteRow>(`pb_websites?id=eq.${enc(l.website_id)}&select=${WEBSITE_COLS}`));
      const site = sites.get(l.website_id);
      const d = site ? await gql<{ product: { media: { nodes: { status?: string }[] } } | null }>(site, MEDIA, { id: l.shopify_product_id }, 20_000) : null;
      const nodes = d?.product?.media?.nodes || [];
      const v = d?.product ? mediaVerdict(nodes, at) : 'ok'; // the website or the product is gone: nothing to look at
      if (v === 'wait') continue;
      if (v === 'ok') await settle();
      else if ((await settle({ error: [l.error, photoNote(v, nodes.length)].filter(Boolean).join(' ').slice(0, 900) })).length) {
        await logActivity({ product_id: l.product_id, website_id: l.website_id, listing_id: l.id, action: 'media_failed', details: { failed: v, of: nodes.length } });
      }
      n++;
    } catch (e) {
      down.add(l.website_id);
      console.error(`pb-products media check ${l.id}: ${plain(e)}`);
      if (Date.now() - Date.parse(at) > GIVE_UP_MS) await settle().catch(w => console.error(`pb-products media settle ${l.id}: ${plain(w)}`));
    }
  }
  return n;
}
