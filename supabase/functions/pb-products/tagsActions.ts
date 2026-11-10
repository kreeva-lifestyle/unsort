// Staff actions on tags (index.ts): the library, the review queue, acting on
// tags (keep / hide / unhide / merge / rename / kind), the cleaning rules, a
// live "would this be hidden?" test, the re-clean of every product (dry run →
// apply) and set_product_tags. SQL functions: 20261110090000_pb_tags.sql.
import { uuid, type Body } from './actions.ts';
import { SB_URL, enc, getSettings, insert, logActivity, nowIso, patch, rpc, sel, svcHeaders } from './db.ts';
import { HttpError } from './http.ts';
import { MAX_PATTERNS, type TagSettings, hideReason, normalizeTag, patternProblem, tagSettings } from './tagClean.ts';
import { type ProductTagResult, sameTags } from './tagEngine.ts';
import { TAG_PRODUCT_COLS, type TagProduct, bumpLibrary, computeTags, setProductTags, tagCtx, tagsLocked } from './tagStore.ts';
import { TAG_COLS, type TagRow } from './types.ts';

const KINDS = ['collection', 'category', 'fabric', 'colour', 'occasion', 'style', 'work', 'size', 'other'];
const PAGE = 500;

async function count(filter: string): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/pb_tags?select=id&${filter}`, { method: 'HEAD', headers: { ...svcHeaders, prefer: 'count=exact' } });
  return Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
}

/** tags_library { q?, kind?, hidden?, aliases?, page?, per? } → rows + counts (aliases left out unless asked). */
export async function tagsLibrary(b: Body) {
  const per = Math.min(200, Math.max(1, Math.floor(Number(b.per)) || 50));
  const page = Math.max(0, Math.floor(Number(b.page)) || 0);
  const q = String(b.q ?? '').replace(/[%*,()\\]/g, ' ').trim().slice(0, 60);
  const f = [
    b.aliases === true ? '' : 'merged_into=is.null',
    q ? `name=ilike.*${enc(q)}*` : '', KINDS.includes(String(b.kind)) ? `kind=eq.${enc(String(b.kind))}` : '',
    typeof b.hidden === 'boolean' ? `hidden=eq.${b.hidden}` : '',
  ].filter(Boolean).join('&') || 'id=not.is.null';
  const [rows, total, all, hidden, review] = await Promise.all([
    sel<TagRow>(`pb_tags?select=${TAG_COLS}&${f}&order=uses.desc,name.asc&limit=${per}&offset=${page * per}`),
    count(f), count('merged_into=is.null'), count('merged_into=is.null&hidden=eq.true'), count('merged_into=is.null&reviewed_at=is.null'),
  ]);
  return { ok: true, rows, count: total, page, per, counts: { all, hidden, review } };
}

/** tags_review { days? } → the queue (never reviewed, or first seen lately) with 3 example products each. */
export async function tagsReview(b: Body) {
  const days = Math.min(365, Math.max(1, Math.floor(Number(b.days)) || 30));
  const rows = await rpc<(TagRow & { examples: string[] })[]>('pb_tags_review', { p_days: days, p_limit: 200 });
  return { ok: true, rows, days };
}

/** tags_act { ids[], action: keep|hide|unhide|merge|rename|kind, into?, name?, kind? } → { ok, done }. */
export async function tagsAct(b: Body, userId: string | null) {
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(v => uuid(v, 'A tag id')).slice(0, 200);
  if (!ids.length) throw new HttpError(400, 'Pick at least one tag.');
  const action = String(b.action || '');
  const inList = `id=in.(${ids.map(enc).join(',')})`;
  let done = 0;
  if (action === 'keep') done = (await patch('pb_tags', inList, { reviewed_at: nowIso() })).length;
  else if (action === 'hide' || action === 'unhide') done = (await patch('pb_tags', inList, { hidden: action === 'hide', reviewed_at: nowIso() })).length; // = pb_tag_hide, in one write
  else if (action === 'merge') {
    const into = uuid(b.into, 'The tag to merge into');
    for (const id of ids.filter(i => i !== into)) { await rpc('pb_tag_merge', { p_from: id, p_into: into }); done++; }
  } else if (action === 'rename') {
    if (ids.length !== 1) throw new HttpError(400, 'Rename one tag at a time.');
    const name = normalizeTag(b.name, false);
    if (!name) throw new HttpError(400, 'Give the tag a name.');
    await rpc('pb_tag_rename', { p_id: ids[0], p_name: name }); done = 1;
  } else if (action === 'kind') {
    const kind = String(b.kind || '');
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Pick a kind from the list.');
    done = (await patch('pb_tags', inList, { kind, reviewed_at: nowIso() })).length;
  } else throw new HttpError(400, 'Unknown tag action.');
  await logActivity({ action: 'tags_edited', details: { action, count: done }, user_id: userId });
  return { ok: true, done };
}

/** The rules as given, or a 400 naming the bad pattern. */
function validRules(v: unknown): TagSettings {
  const o = (v && typeof v === 'object' ? v : {}) as { hide_patterns?: unknown };
  const ps = Array.isArray(o.hide_patterns) ? o.hide_patterns.map(p => String(p ?? '').trim()).filter(Boolean) : [];
  if (ps.length > MAX_PATTERNS) throw new HttpError(400, `At most ${MAX_PATTERNS} hide patterns.`);
  for (const p of ps) { const why = patternProblem(p); if (why) throw new HttpError(400, why); }
  return tagSettings({ ...o, hide_patterns: ps });
}

/** tags_settings_save { rules } (admin / manager) → { ok, rules }. Nothing is re-cleaned here (tags_reclean). */
export async function tagsSettingsSave(b: Body, userId: string | null) {
  const rules = validRules(b.rules);
  await insert('pb_settings', [{ key: 'tags', value: rules }], { onConflict: 'key', mode: 'merge' });
  await logActivity({ action: 'settings_edited', details: { key: 'tags' }, user_id: userId });
  return { ok: true, rules };
}

/** tags_test { tags[], rules? } → for each: its clean name and whether (and why) the rules would hide it. */
export async function tagsTest(b: Body) {
  const rules = b.rules ? validRules(b.rules) : (await getSettings()).tags;
  const tags = (Array.isArray(b.tags) ? b.tags : [b.tag]).map(t => String(t ?? '')).slice(0, 50);
  const results = tags.map(raw => {
    const name = normalizeTag(raw, rules.title_case);
    const why = hideReason(name, rules);
    return { tag: raw, name, kept: !why, ...(why ? { reason: why.reason, ...(why.pattern ? { pattern: why.pattern } : {}) } : {}) };
  });
  return { ok: true, results, rules };
}

/** tags_reclean { dry_run } → every product's tags rebuilt with the current rules, its existing tags
 *  re-checked too (locked products kept). Dry run: how many would change (`changed`), with a sample;
 *  apply: tells the library once per batch, then writes the batch in one RPC. */
export async function tagsReclean(b: Body, userId: string | null) {
  const dry = b.dry_run !== false;
  const ctx = await tagCtx();
  const changes: { id: string; name: string | null; before: string[]; after: string[]; added: string[]; removed: string[]; r: ProductTagResult }[] = [];
  let scanned = 0, skipped = 0;
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sel<TagProduct & { name: string | null }>(`pb_products?select=${TAG_PRODUCT_COLS}&status=neq.archived&order=id.asc&limit=${PAGE}&offset=${offset}`);
    for (const p of rows) {
      scanned++;
      if (tagsLocked(p)) { skipped++; continue; }
      const r = computeTags(p, ctx, [], true);
      const before = p.tags || [];
      if (!sameTags(before, r.tags)) {
        const b = new Set(before.map(t => t.toLowerCase())), a = new Set(r.tags.map(t => t.toLowerCase()));
        changes.push({ id: p.id, name: p.name, before, after: r.tags, added: r.tags.filter(t => !b.has(t.toLowerCase())), removed: before.filter(t => !a.has(t.toLowerCase())), r });
      }
    }
    if (rows.length < PAGE) break;
  }
  const sample = changes.slice(0, 10).map(c => ({ id: c.id, name: c.name, before: c.before, after: c.after, added: c.added, removed: c.removed }));
  if (dry) return { ok: true, dry_run: true, products: scanned, locked: skipped, changed: changes.length, sample };
  let changed = 0;
  for (let i = 0; i < changes.length; i += 300) {
    const batch = changes.slice(i, i + 300);
    await bumpLibrary({ tags: batch.flatMap(c => c.after), hidden: batch.flatMap(c => c.r.hidden), sources: Object.assign({}, ...batch.map(c => c.r.sources)) }, ctx);
    changed += Number(await rpc<number>('pb_products_set_tags', { p_rows: batch.map(c => ({ id: c.id, tags: c.after })) })) || 0;
  }
  await logActivity({ action: 'tags_recleaned', details: { scanned, changed, locked: skipped }, user_id: userId });
  return { ok: true, dry_run: false, products: scanned, locked: skipped, changed, sample };
}

/** set_product_tags { product_id, tags[] } → { ok, tags, flagged, locked } (locks 'tags' on the product). */
export async function setTags(b: Body, userId: string | null) {
  const id = uuid(b.product_id, 'product_id');
  if (!Array.isArray(b.tags)) throw new HttpError(400, 'tags must be a list.');
  const given = b.tags.map(t => String(t ?? '')).slice(0, 100);
  const r = await setProductTags(id, given, await tagCtx());
  await logActivity({ product_id: id, action: 'edited', details: { fields: ['tags'], count: r.tags.length }, user_id: userId });
  return { ok: true, tags: r.tags, flagged: r.flagged, hidden: r.hidden, locked: r.locked };
}
