// The words of the bulk-change log (Settings → Bulk changes): what a row
// counts, what a revert would do (from the server's counts, before anyone
// confirms) and what it did. Pure: no I/O.
import type { BulkCounts, PbBulkRun } from '../../data/bulk';
import { count } from '../../format';

type Kind = PbBulkRun['kind'];
const PRODUCTS: Kind[] = ['import', 'reread_failed', 'reread'];
/** "1 product" / "136 products". */
const n = (k: number, one: string, many = `${one}s`) => `${count(k)} ${k === 1 ? one : many}`;
/** Pick the singular or the plural wording. */
const s = (k: number, one: string, many: string) => (k === 1 ? one : many);

/** What the rows of a bulk change are: "136 products", "118 listings". */
export const rows = (kind: Kind, k: number) => (PRODUCTS.includes(kind) ? n(k, 'product') : n(k, 'listing'));
/** Retrying and reading again only repeat a step that failed: there is nothing to put back, only a queue to stop. */
export const onlyStops = (kind: Kind) => kind === 'retry_failed' || kind === 'reread_failed';
export const verb = (kind: Kind) => (onlyStops(kind) ? 'Stop the rest' : 'Revert');

export interface Plan { lines: string[]; note: string; confirm: string; danger: boolean; todo: number }
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
    note = 'They stay off this website until you tap Send matching products now again.';
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
  else parts.push(`Put back ${n(v('restored'), 'product')}`, ...(v('changed') ? [`${count(v('changed'))} edited since left as ${s(v('changed'), 'it is', 'they are')}`] : []));
  if (v('busy')) parts.push(`${count(v('busy'))} busy right now: tap Revert again in a few minutes`);
  return parts.join(' · ');
}
