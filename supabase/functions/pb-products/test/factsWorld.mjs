// A fake Supabase and a fake Shopify for the small send of a product's type, tags and custom fields (factsSend.ts,
// storeCollections.ts, factsSite.ts) and for a full publish of the same listing (publish.ts). Not a test: shared by
// factsSend.test.mjs, factsStore.test.mjs and publishFacts.test.mjs.
// The listing filters the send relies on are applied for real (facts_due, the stamp facts_tried_at, tags locked, no note), and
// `w.onUpdate` runs while the store is being updated, so a test can change the product "meanwhile" as the database
// trigger would (pb_facts_follow wipes the stamp).
globalThis.Deno = { env: { get: (k) => (k === 'SUPABASE_URL' ? 'https://sb.example' : 'test') } };

export const P = 'cccccccc-0000-4000-8000-000000000001', W = 'eeeeeeee-0000-4000-8000-000000000001', L = 'dddddddd-0000-4000-8000-000000000001';
export const GID = 'gid://shopify/Product/1';
const RULES = { case: 'title', static: [], ai_extra: true, ai_extra_max: 5, max_tags: 8, tag_style: 'plain', ai_allowed: [], templates: ['{category}', '{color}', '{tags}'] };

/** Does the listing pass the filters of this PostgREST path? Only the ones the send uses. */
function passes(l, path) {
  const q = path.slice(path.indexOf('?') + 1);
  if (/(^|&)facts_due=eq\.true/.test(q) && !l.facts_due) return false;
  const stamp = /(^|&)facts_tried_at=eq\.([^&]+)/.exec(q);
  if (stamp && l.facts_tried_at !== stamp[2]) return false;
  const untried = /or=\(facts_tried_at\.is\.null,facts_tried_at\.lt\.([^)]+)\)/.exec(q);
  if (untried && l.facts_tried_at && !(l.facts_tried_at < untried[1])) return false;
  if (q.includes('locked=not.cs.{tags}') && (l.locked || []).includes('tags')) return false;
  if (/(^|&)error=is\.null/.test(q) && l.error) return false;
  return true;
}

export function world(o = {}) {
  const w = {
    product: { id: P, vendor_id: null, source: 'import', sku: 'KB 302', name: 'Maroon lehenga', category: 'Lehenga', fabric: 'Georgette', color: 'Maroon', sizes: ['M'], in_stock: true, temp_out_at: null, perm_out_at: null,
      cost_price: 500, status: 'ready', tags: ['Embroidery'], missing_attrs: [], locked: [], attributes: {}, sku_colour: '', ...o.product },
    listing: { id: L, product_id: P, website_id: W, status: 'published', price: 999, compare_at_price: null, title: 'Maroon lehenga', description_html: '<p>A lehenga.</p>', handle: 'maroon-lehenga', image_alts: [], attempts: 0,
      tags: ['Saree', 'Red'], product_type: 'Saree', locked: [], generated_at: '2026-11-02T00:00:00Z',
      shopify_product_id: GID, shopify_status: 'ACTIVE', published_at: '2026-11-03T00:00:00Z', claimed_at: null, facts_due: true, facts_force: false, facts_tried_at: null,
      sent: { type: 'Saree', tags: ['Saree', 'Red'], fields: {} }, ai_tags: null, ...o.listing },
    site: { id: W, name: 'Kreeva', shop_domain: 'kreeva.myshopify.com', auth_mode: 'token', api_version: '2026-10', active: true, publish_mode: 'live', track_inventory: false, pricing: {}, connected_at: '2026-11-01T00:00:00Z',
      tag_rules: RULES, content: { profile: { custom_fields: true } }, ...o.site },
    /** The product's chosen values: [attribute key, value name]. */
    values: o.values ?? [['Colour', 'Maroon'], ['Work', 'Embroidery']],
    attrs: o.attrs ?? [{ id: 'a1', key: 'Colour', multi: false, by_category: false }, { id: 'a2', key: 'Work', multi: true, by_category: false }],
    store: o.store === undefined ? { id: GID, tags: ['Saree', 'Red', 'Typed In Shopify'], productType: 'Saree' } : o.store,
    collections: o.collections ?? [{ id: 'gid://shopify/Collection/1', handle: 'saree', title: 'Saree' }, { id: 'gid://shopify/Collection/2', handle: 'lehenga', title: 'Lehenga' }],
    rules: o.rules ?? {}, // collection id → [{ id, title }]
    published: o.published ?? [], activity: [], calls: [], refuse: o.refuse ?? null, down: !!o.down, noCollection: o.noCollection ?? null, onUpdate: o.onUpdate ?? null,
  };
  const names = () => w.calls.map(c => c.name);
  w.names = names;
  w.shopify = () => w.calls.filter(c => c.shopify);
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : null;
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.startsWith('https://kreeva.myshopify.com/')) {
      const name = (/^\s*(?:query|mutation)\s+(\w+)/.exec(body.query) || [])[1] || 'other', v = body.variables || {};
      w.calls.push({ shopify: true, name, v });
      if (w.down) return ok({}, 500);
      if (name === 'PbFactsRead') return ok({ data: { product: w.store ? { id: w.store.id, tags: w.store.tags } : null } });
      if (name === 'PbFacts') {
        if (w.refuse) return ok({ data: { productUpdate: { product: null, userErrors: [{ field: ['tags'], message: w.refuse }] } } });
        if ('productType' in v.product) w.store.productType = v.product.productType;
        w.store.tags = v.product.tags;
        if (w.onUpdate) w.onUpdate(w);
        return ok({ data: { productUpdate: { product: { id: GID }, userErrors: [] } } });
      }
      if (name === 'PbExisting') return ok({ data: { product: w.store ? { id: GID, handle: 'maroon-lehenga', tags: w.store.tags, options: [{ id: 'o1', name: 'Size', optionValues: [{ id: 'ov1', name: 'M' }] }],
        variants: { nodes: [{ id: 'v1', selectedOptions: [{ name: 'Size', value: 'M' }] }] }, media: { nodes: [] }, metafield: { value: L } } : null } });
      if (name === 'PbProductSet') { // the full publish: `w.set` = what it sent
        w.set = v.input; w.store.tags = v.input.tags; w.store.productType = v.input.productType;
        return ok({ data: { productSet: { product: { id: GID, status: 'ACTIVE', handle: 'maroon-lehenga', media: { nodes: [] } }, userErrors: [] } } });
      }
      if (name === 'PbFieldKinds') return ok({ data: { metafieldDefinitions: { nodes: [] } } });
      if (name === 'PbFields') return ok({ data: { metafieldsSet: { userErrors: [] } } });
      if (name === 'PbFieldsDrop') return ok({ data: { metafieldsDelete: { deletedMetafields: v.metafields.map(m => ({ key: m.key })), userErrors: [] } } });
      if (name === 'PbCols') return ok({ data: { collections: { nodes: w.collections, pageInfo: { hasNextPage: false, endCursor: null } } } });
      if (name === 'PbCol') {
        if (w.noCollection) return ok({ data: { collectionCreate: { collection: null, userErrors: [{ field: ['title'], message: w.noCollection }] } } });
        const made = { id: `gid://shopify/Collection/${w.collections.length + 1}`, handle: v.c.handle, title: v.c.title };
        w.collections.push(made);
        return ok({ data: { collectionCreate: { collection: made, userErrors: [] } } });
      }
      if (name === 'PbColRules') return ok({ data: { collection: { id: v.id, sources: w.rules[v.id] ?? [] } } });
      if (name === 'PbColUpdate') {
        if (w.refuse) return ok({ data: { collectionUpdate: { collection: null, userErrors: [{ field: ['title'], message: w.refuse }] } } });
        const c = w.collections.find(x => x.id === v.c.id);
        c.title = v.c.title;
        for (const s of v.c.sourcesToCreate || []) (w.rules[c.id] ??= []).push({ id: `rule${(w.rules[c.id] || []).length + 1}`, title: s.source.title });
        return ok({ data: { collectionUpdate: { collection: { id: c.id, title: c.title }, userErrors: [] } } });
      }
      if (body.query.includes('publications')) return ok({ data: { publications: { nodes: [{ id: 'gid://shopify/Publication/1', catalog: { title: 'Online Store' } }] } } });
      if (body.query.includes('publishablePublish')) return ok({ data: { publishablePublish: { userErrors: [] } } });
      return ok({ data: {} });
    }
    const path = u.replace('https://sb.example/rest/v1/', '');
    w.calls.push({ shopify: false, name: `${method} ${path.split('?')[0]}`, path, body });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${o.count ?? 1}` } });
    if (path.startsWith('pb_products?')) return ok([w.product]);
    if (path.startsWith('pb_websites?')) return ok(path.includes('active=eq.true') && !w.site.active ? [] : [w.site]);
    if (path.startsWith('pb_website_secrets?')) return ok(method === 'GET' ? [{ access_token: 'shpat_test', online_store_publication_id: 'gid://shopify/Publication/1' }] : [{}]);
    if (path.startsWith('pb_vendors?')) return ok([{ name: 'Kreeva Vendor', codes: ['KB'] }]);
    if (path.startsWith('pb_attributes?')) return ok(w.attrs);
    if (path.startsWith('pb_product_values?')) return ok(w.values.map(([key, name], i) => {
      const a = w.attrs.find(x => x.key === key);
      return { pb_attribute_values: { attribute_id: a.id, name, position: i, categories: [], pb_attributes: { name: key, shopify_prefix: null, position: w.attrs.indexOf(a), by_category: false } } };
    }));
    if (path.startsWith('pb_listings?') && method === 'GET') return ok(passes(w.listing, path) && w.site.active ? [w.listing] : []);
    if (path.startsWith('pb_listings?') && method === 'PATCH') {
      if (!passes(w.listing, path)) return ok([]);
      Object.assign(w.listing, body);
      return ok([{ id: L }]);
    }
    if (path.startsWith('pb_activity?') && method === 'GET') return ok(path.includes('action=eq.failed') ? [] : w.published);
    if (path.startsWith('pb_activity') && method === 'POST') { w.activity.push(body[0]); return ok([{}], 201); }
    return ok(method === 'GET' ? [] : [{}], method === 'POST' ? 201 : 200);
  };
  return w;
}
