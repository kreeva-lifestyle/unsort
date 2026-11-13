// The words of the bulk-change log (Settings → Bulk changes): what a row
// counts, what a revert would do (from the server's counts, before anyone
// confirms) and what it did. Pure: no I/O.
import type { BulkCounts, PbBulkRun } from '../../data/bulk';
import { count } from '../../format';

type Kind = PbBulkRun['kind'];
/** Changes that reach products through the tag lists: one revert serves them all (the server's counts are the same). */
const TAGS: Kind[] = ['retag', 'tag_fill', 'value_delete', 'value_merge', 'attribute_delete', 'categories', 'category_links', 'suggestions'];
const PRODUCTS: Kind[] = ['import', 'reread_failed', 'reread', 'copies', 'stock_notice', ...TAGS];
/** "1 product" / "136 products". */
const n = (k: number, one: string, many = `${one}s`) => `${count(k)} ${k === 1 ? one : many}`;
/** Pick the singular or the plural wording. */
const s = (k: number, one: string, many: string) => (k === 1 ? one : many);

/** What the rows of a bulk change are: "136 products", "118 listings"; a tag-list change that reached fewer than two
 *  products is counted by what it changed in the lists (`unit`, from the server: "4 tag-list entries", "12 suggestions"). */
export const rows = (kind: Kind, k: number, unit?: unknown) => (unit === 'entries' ? n(k, 'tag-list entry', 'tag-list entries')
  : unit === 'suggestions' ? n(k, 'suggestion') : PRODUCTS.includes(kind) ? n(k, 'product') : n(k, 'listing'));
/** Retrying and reading again only repeat a step that failed: there is nothing to put back, only a queue to stop. */
export const onlyStops = (kind: Kind) => kind === 'retry_failed' || kind === 'reread_failed';
export const verb = (kind: Kind) => (onlyStops(kind) ? 'Stop the rest' : 'Revert');

export interface Plan { lines: string[]; note: string; confirm: string; danger: boolean; todo: number }
const TAG_CONFIRM: Partial<Record<Kind, string>> = {
  value_delete: 'Bring the value back', attribute_delete: 'Bring the attribute back', value_merge: 'Separate them again', categories: 'Put the list back',
  category_links: 'Put the must-have tags back', suggestions: 'Put the suggestions back', retag: 'Put the tags back', tag_fill: 'Take the AI tags off',
};
const busy = (k: number, what: string) => `${what} ${s(k, 'is', 'are')} being worked on right now. Tap Revert again in a few minutes for ${s(k, 'it', 'them')}.`;

/** What a revert would do now, in plain sentences. `todo` = 0: nothing is left to take back. */
export function plan(run: Pick<PbBulkRun, 'kind' | 'details'>, c: BulkCounts): Plan {
  const v = (k: string) => Number(c[k]) || 0;
  const lines: string[] = [];
  const add = (k: number, text: string) => { if (k > 0) lines.push(text); };
  const unit = PRODUCTS.includes(run.kind) ? 'product' : 'listing';
  let note = '', confirm = 'Revert', danger = false, todo = 0;
  if (run.kind === 'import') {
    todo = v('delete');
    add(todo, `${n(todo, 'product')} this import added will be deleted, with ${s(todo, 'its', 'their')} photos.`);
    add(v('on_site'), `${n(v('on_site'), 'product')} ${s(v('on_site'), 'is on a website and stays', 'are on a website and stay')}. Take ${s(v('on_site'), 'it', 'them')} off the website first, then revert again.`);
    add(v('edited'), `${n(v('edited'), 'product')} ${s(v('edited'), 'was edited by hand since and stays', 'were edited by hand since and stay')}.`);
    note = 'Deleting cannot be undone. To get them back, import the same website again: the AI reads them again.';
    confirm = `Delete ${n(todo, 'product')}`; danger = true;
  } else if (run.kind === 'route_site') {
    todo = v('aside') + v('live');
    add(v('aside'), `${n(v('aside'), 'listing')} not on the store yet ${s(v('aside'), 'is', 'are')} taken back: nothing more is written or published for ${s(v('aside'), 'it', 'them')}.`);
    add(v('live'), `${n(v('live'), 'listing')} ${s(v('live'), 'is', 'are')} live on the store. Playbook takes ${s(v('live'), 'it', 'them')} off in the next minutes: hidden in Shopify, not deleted.`);
    add(v('off'), `${n(v('off'), 'listing')} ${s(v('off'), 'was', 'were')} already removed.`);
    note = 'They stay off this website until you send them again: Send matching products now for the ones that never reached the store, Put back on site for one that was hidden there.';
    confirm = `Take back ${n(todo, 'listing')}`; danger = v('live') > 0;
  } else if (run.kind === 'reprice_site') {
    todo = v('restored');
    add(todo, `${n(todo, 'listing')} ${s(todo, 'gets', 'get')} the old price back.${v('resend') ? ` ${count(v('resend'))} of them ${s(v('resend'), 'is', 'are')} live and ${s(v('resend'), 'is', 'are')} sent to the store again.` : ''}`);
    add(v('changed'), `${n(v('changed'), 'listing')} had ${s(v('changed'), 'its', 'their')} price changed since and ${s(v('changed'), 'stays as it is', 'stay as they are')}.`);
    note = 'The pricing rule of this website is not changed. If the rule was the mistake, correct it under Websites → Pricing, or new and rewritten listings keep using it.';
    confirm = `Put back ${n(todo, 'price')}`;
  } else if (onlyStops(run.kind)) {
    todo = v('stopped');
    const [again, back] = run.kind === 'retry_failed' ? ['tried again', 'Failed'] : ['read again', 'Needs info'];
    add(todo, `${n(todo, unit)} not ${again} yet ${s(todo, 'goes', 'go')} back to ${back}.`);
    add(v('went'), `${n(v('went'), unit)} ${s(v('went'), 'was', 'were')} already ${again} and ${s(v('went'), 'stays as it is', 'stay as they are')}.`);
    note = 'This only repeated a step that had failed, so there is nothing else to take back.';
    confirm = `Stop ${n(todo, unit)}`;
  } else if (run.kind === 'copies') {
    todo = v('restored');
    add(todo, `${n(todo, 'product')} ${s(todo, 'comes', 'come')} out of Archived and ${s(todo, 'waits', 'wait')} in Needs info as ${s(todo, 'a copy', 'copies')} again.`);
    add(v('not_copies'), `${n(v('not_copies'), 'product')} ${s(v('not_copies'), 'is no longer a copy of anything (what it copied was archived or changed) and stays', 'are no longer copies of anything (what they copied was archived or changed) and stay')} in Archived. Open ${s(v('not_copies'), 'it', 'one')} and tap Restore to bring it back.`);
    add(v('changed'), `${n(v('changed'), 'product')} ${s(v('changed'), 'was restored or changed since and stays as it is', 'were restored or changed since and stay as they are')}.`);
    note = 'Nothing is sent to a website by this: the products wait for your answer again.';
    confirm = `Put back ${n(todo, 'product')}`;
  } else if (TAGS.includes(run.kind)) {
    const back = v('values_back'), out = v('values_gone'), tin = v('tags_in'), tout = v('tags_out');
    todo = back + out + tin + tout + v('links') + v('suggestions') + v('list');
    if (run.kind === 'attribute_delete') add(back, `The attribute comes back to the tag lists${back > 1 ? `, with ${n(back - 1, 'value')}` : ''}.`);
    else add(back, `${n(back, 'tag value')} ${s(back, 'comes', 'come')} back to the tag lists.`);
    add(out, `${n(out, 'tag value')} this change added ${s(out, 'is', 'are')} taken out of the lists again.`);
    add(v('list'), 'The category list goes back to how it was.');
    add(v('links'), `The must-have tags of the categories go back to how they were (${n(v('links'), 'change')}).`);
    add(v('suggestions'), `${n(v('suggestions'), 'suggestion')} ${s(v('suggestions'), 'goes', 'go')} back to how ${s(v('suggestions'), 'it was', 'they were')}.`);
    add(tin + tout, `The tags of ${n(v('products'), 'product')} go back to how they were: ${[tin ? `${n(tin, 'tag')} put back` : '', tout ? `${n(tout, 'tag')} taken off` : ''].filter(Boolean).join(', ')}.`);
    add(v('kept'), `${n(v('kept'), 'product')} had ${s(v('kept'), 'its', 'their')} tags set by hand since and ${s(v('kept'), 'stays as it is', 'stay as they are')}.`);
    add(v('left'), `${n(v('left'), 'tag')} ${s(v('left'), 'stays', 'stay')} off: the product has another value for that by now, or was edited by hand since.`);
    note = 'Every product it reached is checked again: one missing a must-have tag goes to Needs info, one with all of them goes to Ready and is matched to the websites as usual. The revert itself sends nothing to a store.';
    confirm = TAG_CONFIRM[run.kind] || 'Revert';
  } else if (run.kind === 'stock_notice') {
    todo = v('restored');
    const word = String(run.details?.notice || '');
    add(todo, `${n(todo, 'product')} ${s(todo, 'gets', 'get')} back the stock ${s(todo, 'it', 'they')} had before the notice${word === 'permanent' ? `, and ${s(todo, 'comes', 'come')} out of Archived` : ''}.${word === 'temporary' ? ' Nothing changes on the websites.' : ` ${s(todo, 'Its', 'Their')} websites are told.`}`);
    add(v('back'), `${n(v('back'), 'listing')} the notice took off a website ${s(v('back'), 'goes', 'go')} back: one archived in Shopify is sent again and made visible, one that never reached its store waits where it was.`);
    add(v('changed'), `${n(v('changed'), 'product')} had ${s(v('changed'), 'its', 'their')} stock changed since (by hand or by a later post) and ${s(v('changed'), 'stays as it is', 'stay as they are')}.`);
    note = 'The notice itself stays in Products as it is. If the vendor really is out of stock, switch Stock off on the product, or the next notice marks it again.';
    confirm = `Put back ${n(todo, 'product')}`;
  } else {
    todo = v('restored');
    const cut = Number(run.details?.notes_cut) || 0;
    add(todo, `${n(todo, 'product')} ${s(todo, 'gets', 'get')} back what ${s(todo, 'it', 'they')} said before: name, colour, work, pattern, set contents and wash care (${n(v('fields'), 'field')}).`);
    add(cut, `The old notes of ${n(cut, 'product')} were only kept up to their first 200 letters, so those notes stay as they are now.`);
    add(v('changed'), `${n(v('changed'), 'product')} ${s(v('changed'), 'was edited since and stays as it is', 'were edited since and stay as they are')}.`);
    note = 'The tags Playbook reads off the text are worked out again for these products.';
    confirm = `Put back ${n(todo, 'product')}`;
  }
  add(v('gone'), `${n(v('gone'), unit)} no longer ${s(v('gone'), 'exists', 'exist')}.`);
  add(v('busy'), busy(v('busy'), n(v('busy'), unit)));
  return { lines, note, confirm, danger, todo };
}

/** What a revert did, in one line (the toast, and the row afterwards). */
export function done(kind: Kind, c: BulkCounts | null): string {
  const v = (k: string) => Number(c?.[k]) || 0;
  const unit = PRODUCTS.includes(kind) ? 'product' : 'listing';
  const parts: string[] = [];
  if (kind === 'import') parts.push(`Deleted ${n(v('deleted'), 'product')}`, ...(v('on_site') ? [`${count(v('on_site'))} on a website kept`] : []), ...(v('edited') ? [`${count(v('edited'))} edited by hand kept`] : []));
  else if (kind === 'route_site') parts.push(`Took back ${n(v('aside') + v('live'), 'listing')}`, ...(v('live') ? [`${count(v('live'))} of them ${s(v('live'), 'comes', 'come')} off the store in the next minutes`] : []));
  else if (kind === 'reprice_site') parts.push(`Put back ${n(v('restored'), 'price')}`, ...(v('resend') ? [`${count(v('resend'))} sent to the store again`] : []), ...(v('changed') ? [`${count(v('changed'))} changed since left as ${s(v('changed'), 'it is', 'they are')}`] : []));
  else if (onlyStops(kind)) parts.push(`Stopped ${n(v('stopped'), unit)}`, ...(v('went') ? [`${count(v('went'))} had already gone ahead`] : []));
  else if (TAGS.includes(kind)) {
    parts.push(...[v('products') ? `Put back the tags of ${n(v('products'), 'product')}` : '', v('values_back') ? `${n(v('values_back'), 'value')} back in the lists` : '',
      v('values_gone') ? `${n(v('values_gone'), 'added value')} taken out` : '', v('list') ? 'the category list as it was' : '', v('links') ? `${n(v('links'), 'must-have tag')} as before` : '',
      v('suggestions') ? `${n(v('suggestions'), 'suggestion')} as before` : '', v('kept') ? `${count(v('kept'))} edited by hand left as ${s(v('kept'), 'it is', 'they are')}` : ''].filter(Boolean));
    if (!parts.length) parts.push('Nothing was left to put back');
  } else if (kind === 'stock_notice') parts.push(`Put back the stock of ${n(v('restored'), 'product')}`, ...(v('back') ? [`${n(v('back'), 'listing')} back on ${s(v('back'), 'its website', 'their websites')}`] : []), ...(v('changed') ? [`${count(v('changed'))} changed since left as ${s(v('changed'), 'it is', 'they are')}`] : []));
  else if (kind === 'copies') parts.push(`Put back ${n(v('restored'), 'copy', 'copies')}`, ...(v('not_copies') ? [`${count(v('not_copies'))} no longer ${s(v('not_copies'), 'a copy', 'copies')}, left in Archived`] : []), ...(v('changed') ? [`${count(v('changed'))} changed since left as ${s(v('changed'), 'it is', 'they are')}`] : []));
  else parts.push(`Put back ${n(v('restored'), 'product')}`, ...(v('changed') ? [`${count(v('changed'))} edited since left as ${s(v('changed'), 'it is', 'they are')}`] : []));
  if (v('busy')) parts.push(`${count(v('busy'))} busy right now: tap Revert again in a few minutes`);
  return parts.join(' · ');
}
